import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_SIGNAL_ATTEMPT_TIMEOUT_MS,
  CALL_TERMINAL_FENCE_RETENTION_MS,
  MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES,
  MAX_CALL_TERMINAL_FENCES,
  callSignalCommandSchema,
  callTerminalFenceElapsedNowMs,
  incomingCallInviteAction,
  isCallTerminalFenced,
  parseScopedCallSignalEvent,
  recordCallTerminalFence,
  serializeCallTerminalFences,
} from "@peekpoke/shared";
import { useCallStore } from "@/state/call-store";

const apiFetchMock = vi.hoisted(() => vi.fn());
const secureStorageMock = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getItem: vi.fn(async (key: string) => secureStorageMock.values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    secureStorageMock.values.set(key, value);
  }),
  removeItem: vi.fn(async (key: string) => {
    secureStorageMock.values.delete(key);
  }),
}));
vi.mock("@/lib/api", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(public status: number) {
      super("API request failed");
    }
  },
  apiFetch: apiFetchMock,
}));
vi.mock("@/lib/secure-storage", () => ({ secureStorage: secureStorageMock }));

import { postNativeCallSignal } from "@/lib/call";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const OTHER_CALL = "77777777-7777-4777-8777-777777777777";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const COMMAND = "66666666-6666-4666-8666-666666666666";
const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);

describe(`native call convergence (${process.env.NATIVE_TEST_PLATFORM ?? "shared"})`, () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    secureStorageMock.values.clear();
    secureStorageMock.getItem.mockClear();
    secureStorageMock.setItem.mockClear();
    secureStorageMock.removeItem.mockClear();
    useCallStore.getState().reset();
  });

  it("uses the shared strict event parser before account-scoped state changes", () => {
    const event = {
      version: 1,
      type: "accept",
      commandId: COMMAND,
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      fromUserId: PEER,
      toUserId: ACCOUNT,
      sequence: 2,
      issuedAt: new Date(NOW - 1_000).toISOString(),
      expiresAt: new Date(NOW + 10_000).toISOString(),
    };
    expect(parseScopedCallSignalEvent(event, {
      accountId: ACCOUNT,
      threadId: THREAD,
      callId: CALL,
      peerUserId: PEER,
      capability: CAPABILITY,
      lastSequence: 1,
      nowMs: NOW,
    }).success).toBe(true);
    expect(parseScopedCallSignalEvent({ ...event, toUserId: PEER }, {
      accountId: ACCOUNT,
      nowMs: NOW,
    })).toEqual({ success: false, reason: "wrong-recipient" });
  });

  it("fences stale iOS/Android callbacks after auth changes", () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    expect(useCallStore.getState().startOutgoingCall(ACCOUNT, THREAD, CALL, {
      id: PEER,
      display_name: "Peer",
      username: "peer",
      avatar_url: null,
    })).toBe(true);
    const generation = useCallStore.getState().activeCall!.generation;
    useCallStore.getState().observeAccount(PEER);
    expect(useCallStore.getState().setCallSession(CALL, generation, CAPABILITY, 1)).toBe(false);
  });

  it("ignores an accepted-call invite replay and rejects only a distinct concurrent call", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().setIncomingInvite({
      accountId: ACCOUNT,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: {
        id: PEER,
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
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

  it("atomically dismisses a held invite when a native terminal fence arrives", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().setIncomingInvite({
      accountId: ACCOUNT,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: {
        id: PEER,
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
      capability: CAPABILITY,
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })).toBe(true);

    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    expect(useCallStore.getState().incomingInvite).toBeNull();
    await expect(useCallStore.getState().acceptCall(CALL, generation)).resolves.toBe(false);
    expect(useCallStore.getState().activeCall).toBeNull();
  });

  it("coalesces native acceptance while a persisted terminal fence is loading", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;
    const incoming = {
      accountId: ACCOUNT,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: {
        id: PEER,
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
      capability: CAPABILITY,
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    expect(useCallStore.getState().setIncomingInvite(incoming)).toBe(true);
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const terminalFences = new Map<string, number>();
    recordCallTerminalFence(terminalFences, CALL, elapsedNowMs);
    const serialized = serializeCallTerminalFences(
      terminalFences,
      ACCOUNT,
      elapsedNowMs,
      Date.now(),
    )!;
    let resolveStorage: ((value: string | null) => void) | null = null;
    secureStorageMock.getItem.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStorage = resolve;
    }));

    const firstAcceptance = useCallStore.getState().acceptCall(CALL, generation);
    const secondAcceptance = useCallStore.getState().acceptCall(CALL, generation);
    await vi.waitFor(() => expect(resolveStorage).toBeTypeOf("function"));
    resolveStorage!(serialized);

    await expect(Promise.all([firstAcceptance, secondAcceptance]))
      .resolves.toEqual([false, false]);
    expect(secureStorageMock.getItem).toHaveBeenCalledOnce();
    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(useCallStore.getState().activeCall).toBeNull();
  });

  it("keeps 40+ iOS and Android terminal IDs without unsafe eviction", () => {
    const fences = new Map<string, number>();
    recordCallTerminalFence(fences, CALL, NOW);
    recordCallTerminalFence(fences, CALL, NOW);
    for (let index = 0; index < 40; index += 1) {
      recordCallTerminalFence(fences, `call-${index}`, NOW);
    }

    expect(isCallTerminalFenced(fences, CALL, NOW)).toBe(true);
    expect(fences.size).toBe(41);

    for (let index = 40; index < MAX_CALL_TERMINAL_FENCES - 1; index += 1) {
      recordCallTerminalFence(fences, `call-${index}`, NOW);
    }
    recordCallTerminalFence(fences, "overflow-call", NOW);
    expect(fences.size).toBe(MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES);
    expect(isCallTerminalFenced(fences, "unseen-call", NOW + 1)).toBe(true);
    expect(isCallTerminalFenced(
      fences,
      "unseen-call",
      NOW + CALL_TERMINAL_FENCE_RETENTION_MS + 1,
    )).toBe(false);
  });

  it("fences native decline and end cleanup before late invite delivery", () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;
    const invite = {
      accountId: ACCOUNT,
      generation,
      threadId: THREAD,
      callId: CALL,
      fromUser: {
        id: PEER,
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
      capability: CAPABILITY,
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };

    expect(useCallStore.getState().setIncomingInvite(invite)).toBe(true);
    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);
    expect(useCallStore.getState().setIncomingInvite(invite)).toBe(false);

    expect(useCallStore.getState().startOutgoingCall(ACCOUNT, THREAD, OTHER_CALL, invite.fromUser)).toBe(true);
    expect(useCallStore.getState().clearCall(OTHER_CALL, generation)).toBe(true);
    expect(useCallStore.getState().startOutgoingCall(ACCOUNT, THREAD, OTHER_CALL, invite.fromUser)).toBe(false);
  });

  it("clears native terminal fences on account generation reset", () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const oldGeneration = useCallStore.getState().generation;
    expect(useCallStore.getState().fenceTerminalCall(CALL, oldGeneration)).toBe(true);

    useCallStore.getState().observeAccount(PEER);
    const newGeneration = useCallStore.getState().generation;
    expect(useCallStore.getState().isTerminalCallFenced(CALL, oldGeneration)).toBe(false);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, newGeneration)).toBe(false);
    expect(useCallStore.getState().terminalCallFences.size).toBe(0);
  });

  it("hydrates native terminal fences after a process-state restart", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, generation);
    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(1));

    useCallStore.setState((state) => ({
      accountId: null,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
    }));
    useCallStore.getState().observeAccount(ACCOUNT);
    const restartedGeneration = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, restartedGeneration);

    expect(useCallStore.getState().isTerminalCallFenced(CALL, restartedGeneration)).toBe(true);
  });

  it("clears native persisted fences on account switch and discards corruption", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    let generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, generation);
    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(1));

    useCallStore.getState().observeAccount(PEER);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(0));
    secureStorageMock.values.set(`peekpoke-call-terminal-fences-${PEER}`, "not-json");
    generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(PEER, generation);

    expect(useCallStore.getState().terminalCallFences.size).toBe(0);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(0));
  });

  it("does not restore A fences after A to B to A or explicit sign-out", async () => {
    useCallStore.getState().observeAccount(ACCOUNT);
    let generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, generation);
    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(1));

    useCallStore.getState().observeAccount(PEER);
    generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(PEER, generation);
    useCallStore.getState().observeAccount(ACCOUNT);
    generation = useCallStore.getState().generation;
    await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, generation);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(false);

    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    useCallStore.getState().observeAccount(null);
    await vi.waitFor(() => expect(secureStorageMock.values.size).toBe(0));
  });

  it("rejects injected recipient and unbounded SDP command fields", () => {
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "invite",
      commandId: COMMAND,
      callId: CALL,
      recipientId: PEER,
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "recover-cancel",
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: CAPABILITY,
    }).success).toBe(true);
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "recover-cancel",
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: CAPABILITY,
      capability: CAPABILITY,
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      version: 1,
      type: "offer",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
      sdp: { type: "offer", sdp: "x".repeat(65_537) },
    }).success).toBe(false);
  });

  it("recovers a transient transport failure with the exact same command", async () => {
    const ack = {
      version: 1,
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      acceptedSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      replayed: true,
    };
    apiFetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(ack);
    const command = { version: 1 as const, type: "invite" as const, commandId: COMMAND, callId: CALL };

    await expect(postNativeCallSignal(THREAD, command)).resolves.toEqual(ack);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command));
    expect(apiFetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(command));
    expect(apiFetchMock.mock.calls[0]?.[1]?.timeoutMs).toBe(CALL_SIGNAL_ATTEMPT_TIMEOUT_MS);
  });

  it("retries the exact capability-free recovery identity on iOS and Android", async () => {
    const ack = {
      version: 1,
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      acceptedSequence: 2,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
      replayed: true,
    };
    const command = {
      version: 1 as const,
      type: "recover-cancel" as const,
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: CAPABILITY,
    };
    apiFetchMock.mockRejectedValueOnce(new Error("lost recovery response"))
      .mockResolvedValueOnce(ack);

    await expect(postNativeCallSignal(THREAD, command)).resolves.toEqual(ack);
    expect(apiFetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command));
    expect(apiFetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(command));
  });
});
