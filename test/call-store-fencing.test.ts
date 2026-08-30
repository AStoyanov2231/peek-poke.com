import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { incomingCallInviteAction } from "@peekpoke/shared";
import { useCallStore } from "@/stores/callStore";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const OTHER_CALL = "77777777-7777-4777-8777-777777777777";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const peer = { id: BOB, display_name: "Bob", username: "bob", avatar_url: null };
const persisted = new Map<string, string>();

describe("web call account fencing", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      get length() { return persisted.size; },
      getItem: (key: string) => persisted.get(key) ?? null,
      key: (index: number) => [...persisted.keys()][index] ?? null,
      setItem: (key: string, value: string) => persisted.set(key, value),
      removeItem: (key: string) => persisted.delete(key),
    });
    useCallStore.getState().reset();
    persisted.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  async function observeAccount(accountId: string) {
    useCallStore.getState().observeAccount(accountId);
    const generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(accountId, generation);
    return generation;
  }

  it("invalidates active call state and stale callbacks on account switch", async () => {
    await observeAccount(ALICE);
    expect(useCallStore.getState().startOutgoingCall(ALICE, THREAD, CALL, peer)).toBe(true);
    const generation = useCallStore.getState().activeCall!.generation;
    expect(useCallStore.getState().setCallSession(CALL, generation, CAPABILITY, 1)).toBe(true);

    useCallStore.getState().observeAccount(BOB);
    expect(useCallStore.getState().activeCall).toBeNull();
    expect(useCallStore.getState().setCallStatus(CALL, generation, "connected")).toBe(false);
    expect(useCallStore.getState().clearCall(CALL, generation)).toBe(false);
  });

  it("rejects replayed sequence updates and wrong-account starts", async () => {
    await observeAccount(ALICE);
    expect(useCallStore.getState().startOutgoingCall(BOB, THREAD, CALL, peer)).toBe(false);
    expect(useCallStore.getState().startOutgoingCall(ALICE, THREAD, CALL, peer)).toBe(true);
    const generation = useCallStore.getState().activeCall!.generation;
    expect(useCallStore.getState().setCallSession(CALL, generation, CAPABILITY, 3)).toBe(true);
    expect(useCallStore.getState().advanceCallSequence(CALL, generation, 3)).toBe(false);
    expect(useCallStore.getState().advanceCallSequence(CALL, generation, 4)).toBe(true);
  });

  it("ignores a late invite for the accepted call and marks only a distinct call busy", async () => {
    await observeAccount(ALICE);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().setIncomingInvite({
      accountId: ALICE,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: peer,
      capability: CAPABILITY,
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })).toBe(true);
    await expect(useCallStore.getState().acceptCall(CALL, generation)).resolves.toBe(true);

    const accepted = useCallStore.getState();
    expect(incomingCallInviteAction(
      CALL,
      accepted.activeCall?.callId,
      accepted.incomingInvite?.callId,
    )).toBe("ignore");
    expect(incomingCallInviteAction(
      OTHER_CALL,
      accepted.activeCall?.callId,
      accepted.incomingInvite?.callId,
    )).toBe("reject-busy");
  });

  it("fences declined and ended call identifiers before clearing local state", async () => {
    await observeAccount(ALICE);
    const generation = useCallStore.getState().generation;
    const invite = {
      accountId: ALICE,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: peer,
      capability: CAPABILITY,
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };

    expect(useCallStore.getState().setIncomingInvite(invite)).toBe(true);
    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);
    expect(useCallStore.getState().setIncomingInvite(invite)).toBe(false);

    expect(useCallStore.getState().startOutgoingCall(ALICE, THREAD, OTHER_CALL, peer)).toBe(true);
    expect(useCallStore.getState().clearCall(OTHER_CALL, generation)).toBe(true);
    expect(useCallStore.getState().startOutgoingCall(ALICE, THREAD, OTHER_CALL, peer)).toBe(false);
  });

  it("drops terminal fences at the account generation boundary", async () => {
    await observeAccount(ALICE);
    const aliceGeneration = useCallStore.getState().generation;
    expect(useCallStore.getState().fenceTerminalCall(CALL, aliceGeneration)).toBe(true);

    await observeAccount(BOB);
    const bobGeneration = useCallStore.getState().generation;
    expect(useCallStore.getState().isTerminalCallFenced(CALL, aliceGeneration)).toBe(false);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, bobGeneration)).toBe(false);
    expect(useCallStore.getState().terminalCallFences.size).toBe(0);
  });

  it("hydrates an unexpired fence after process state restarts", async () => {
    const generation = await observeAccount(ALICE);
    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    await useCallStore.getState().flushTerminalCallFencePersistence();
    expect([...persisted.keys()].some((key) => (
      key === `peekpoke:call-terminal-fences:${ALICE}`
      || key.startsWith(`peekpoke:call-terminal-fence-shard:${ALICE}:`)
    ))).toBe(true);

    useCallStore.setState((state) => ({
      accountId: null,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
      terminalFenceEpoch: null,
    }));
    useCallStore.getState().observeAccount(ALICE);
    const restartedGeneration = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ALICE, restartedGeneration);

    expect(useCallStore.getState().isTerminalCallFenced(CALL, restartedGeneration)).toBe(true);
  });

  it("clears persisted fences across A to B to A and sign-out", async () => {
    let generation = await observeAccount(ALICE);
    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);

    generation = await observeAccount(BOB);
    generation = await observeAccount(ALICE);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(false);

    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    await useCallStore.getState().flushTerminalCallFencePersistence();
    useCallStore.getState().observeAccount(null);
    expect(persisted.has(`peekpoke:call-terminal-fences:${ALICE}`)).toBe(false);
    expect(persisted.has(`peekpoke:call-terminal-fence-fallback:${ALICE}`)).toBe(false);
    expect([...persisted.keys()].some((key) => (
      key.startsWith(`peekpoke:call-terminal-fence-shard:${ALICE}:`)
    ))).toBe(false);
    expect(persisted.has(`peekpoke:call-terminal-fence-epoch:${ALICE}`)).toBe(true);
  });

  it("removes corrupted account storage during hydration", async () => {
    persisted.set(`peekpoke:call-terminal-fences:${ALICE}`, "not-json");
    useCallStore.getState().observeAccount(ALICE);
    const generation = useCallStore.getState().generation;

    await expect(useCallStore.getState().hydrateTerminalCallFences(ALICE, generation))
      .resolves.toBe(true);
    expect(useCallStore.getState().isTerminalCallFenced(OTHER_CALL, generation)).toBe(true);
    expect(persisted.has(`peekpoke:call-terminal-fences:${ALICE}`)).toBe(false);
    expect(persisted.has(`peekpoke:call-terminal-fence-fallback:${ALICE}`)).toBe(true);
  });
});
