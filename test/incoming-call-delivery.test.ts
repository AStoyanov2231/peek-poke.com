import { createElement, StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RingHandler = ({ payload }: { payload?: unknown }) => void | Promise<void>;

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const OTHER_CALL = "77777777-7777-4777-8777-777777777777";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const OTHER_CAPABILITY = "88888888-8888-4888-8888-888888888888";
const COMMAND = "66666666-6666-4666-8666-666666666666";

const mocks = vi.hoisted(() => ({
  handler: null as RingHandler | null,
  postCallSignal: vi.fn(),
  removeChannel: vi.fn(),
  unsubscribe: vi.fn(),
}));
const persisted = new Map<string, string>();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const channel = {
        on: (_type: string, _filter: unknown, handler: RingHandler) => {
          mocks.handler = handler;
          return channel;
        },
        subscribe: () => ({ unsubscribe: mocks.unsubscribe }),
      };
      return channel;
    },
    removeChannel: mocks.removeChannel,
  }),
}));

vi.mock("@/lib/webrtc/signaling", () => ({
  postCallSignal: mocks.postCallSignal,
  RING_SIGNAL_EVENT: "ring-invite",
}));

vi.mock("@/stores/selectors", () => ({ useIsPreloading: () => false }));

import { useIncomingCall } from "@/features/call/useIncomingCall";
import { IncomingCallOverlay } from "@/features/call/components/IncomingCallOverlay";
import { useCallStore } from "@/stores/callStore";

let renderer: ReactTestRenderer | null = null;

function Harness() {
  useIncomingCall(ACCOUNT);
  return null;
}

function invite(callId: string, capability: string) {
  const now = Date.now();
  return {
    version: 1,
    type: "invite",
    commandId: COMMAND,
    callId,
    threadId: THREAD,
    capability,
    fromUserId: PEER,
    toUserId: ACCOUNT,
    sequence: 1,
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 29_000).toISOString(),
    fromUser: {
      id: PEER,
      display_name: "Peer",
      username: "peer",
      avatar_url: null,
    },
  };
}

function terminal(
  type: "cancel" | "reject" | "end",
  overrides: Record<string, unknown> = {},
) {
  const now = Date.now();
  return {
    version: 1,
    type,
    commandId: COMMAND,
    callId: CALL,
    threadId: THREAD,
    capability: CAPABILITY,
    fromUserId: PEER,
    toUserId: ACCOUNT,
    sequence: 2,
    issuedAt: new Date(now - 500).toISOString(),
    expiresAt: new Date(now + 14_500).toISOString(),
    ...(type === "reject" ? { reason: "declined" } : {}),
    ...overrides,
  };
}

async function emit(payload: unknown) {
  if (!mocks.handler) throw new Error("Ring listener was not registered");
  await act(async () => {
    await mocks.handler?.({ payload });
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  persisted.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", { randomUUID: () => COMMAND });
  vi.stubGlobal("localStorage", {
    get length() { return persisted.size; },
    getItem: (key: string) => persisted.get(key) ?? null,
    key: (index: number) => [...persisted.keys()][index] ?? null,
    setItem: (key: string, value: string) => persisted.set(key, value),
    removeItem: (key: string) => persisted.delete(key),
  });
  mocks.handler = null;
  mocks.postCallSignal.mockResolvedValue(undefined);
  useCallStore.getState().reset();
  useCallStore.getState().observeAccount(ACCOUNT);
  await useCallStore.getState().hydrateTerminalCallFences(
    ACCOUNT,
    useCallStore.getState().generation,
  );
  await act(async () => {
    renderer = create(createElement(Harness));
  });
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web incoming call delivery convergence", () => {
  it("does not subscribe after reload until terminal fences finish hydrating", async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    mocks.handler = null;
    useCallStore.getState().reset();
    useCallStore.getState().observeAccount(ACCOUNT);
    const generation = useCallStore.getState().generation;

    await act(async () => {
      renderer = create(createElement(Harness));
    });
    expect(mocks.handler).toBeNull();

    await act(async () => {
      await useCallStore.getState().hydrateTerminalCallFences(ACCOUNT, generation);
    });
    expect(mocks.handler).not.toBeNull();
  });

  it("ignores a late accepted-call invite and rejects a distinct call as busy", async () => {
    const firstInvite = invite(CALL, CAPABILITY);
    await emit(firstInvite);
    await expect(useCallStore.getState().acceptCall(
      CALL,
      useCallStore.getState().generation,
    )).resolves.toBe(true);

    await emit(firstInvite);
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    expect(useCallStore.getState().activeCall?.callId).toBe(CALL);

    await emit(invite(OTHER_CALL, OTHER_CAPABILITY));
    expect(mocks.postCallSignal).toHaveBeenCalledOnce();
    expect(mocks.postCallSignal).toHaveBeenCalledWith(THREAD, expect.objectContaining({
      type: "reject",
      callId: OTHER_CALL,
      capability: OTHER_CAPABILITY,
      reason: "busy",
    }));
    expect(useCallStore.getState().activeCall?.callId).toBe(CALL);
  });

  it("does not ring again when the declined invite is delivered late", async () => {
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    const generation = useCallStore.getState().generation;

    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(true);
    await emit(delayedInvite);

    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
  });

  it("preserves a fence across a same-account listener remount", async () => {
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);

    await act(async () => renderer?.unmount());
    renderer = null;
    await act(async () => {
      renderer = create(createElement(Harness));
    });
    await emit(delayedInvite);

    expect(useCallStore.getState().accountId).toBe(ACCOUNT);
    expect(useCallStore.getState().incomingInvite).toBeNull();
  });

  it("preserves a fence through the StrictMode mount-cleanup-mount cycle", async () => {
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);

    await act(async () => renderer?.unmount());
    renderer = null;
    await act(async () => {
      renderer = create(createElement(StrictMode, null, createElement(Harness)));
    });
    await emit(delayedInvite);

    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(true);
    expect(useCallStore.getState().incomingInvite).toBeNull();
  });

  it("cannot accept a terminal invite after a StrictMode remount", async () => {
    await emit(invite(CALL, CAPABILITY));
    const generation = useCallStore.getState().generation;
    await act(async () => renderer?.unmount());
    renderer = null;
    await act(async () => {
      renderer = create(createElement(StrictMode, null, createElement(Harness)));
    });

    expect(useCallStore.getState().fenceTerminalCall(CALL, generation)).toBe(true);
    expect(useCallStore.getState().incomingInvite).toBeNull();
    await expect(useCallStore.getState().acceptCall(CALL, generation)).resolves.toBe(false);
    expect(useCallStore.getState().activeCall).toBeNull();
  });

  it("does not send a stale decline after the invite becomes terminal", async () => {
    await emit(invite(CALL, CAPABILITY));
    const heldInvite = useCallStore.getState().incomingInvite!;
    let overlayRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      overlayRenderer = create(createElement(IncomingCallOverlay, { invite: heldInvite }));
    });
    const declineButton = overlayRenderer!.root.findByProps({ "aria-label": "Decline call" });
    expect(useCallStore.getState().fenceTerminalCall(CALL, heldInvite.generation)).toBe(true);
    mocks.postCallSignal.mockClear();

    await act(async () => {
      await declineButton.props.onClick();
    });

    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    await act(async () => overlayRenderer?.unmount());
  });

  it("hydrates a persisted fence before subscribing after process restart", async () => {
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    expect(useCallStore.getState().clearInvite(
      CALL,
      useCallStore.getState().generation,
    )).toBe(true);
    await useCallStore.getState().flushTerminalCallFencePersistence();
    expect([...persisted.keys()].some((key) => (
      key === `peekpoke:call-terminal-fences:${ACCOUNT}`
      || key.startsWith(`peekpoke:call-terminal-fence-shard:${ACCOUNT}:`)
    ))).toBe(true);
    await act(async () => renderer?.unmount());
    renderer = null;

    useCallStore.setState((state) => ({
      accountId: null,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
    }));
    useCallStore.getState().observeAccount(ACCOUNT);
    await useCallStore.getState().hydrateTerminalCallFences(
      ACCOUNT,
      useCallStore.getState().generation,
    );
    await act(async () => {
      renderer = create(createElement(Harness));
    });
    await emit(delayedInvite);

    expect(useCallStore.getState().incomingInvite).toBeNull();
  });

  it("keeps the oldest fence through 40 newer terminals and wall-clock jumps", async () => {
    const wallBase = Date.now();
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    const generation = useCallStore.getState().generation;
    expect(useCallStore.getState().clearInvite(CALL, generation)).toBe(true);
    for (let index = 0; index < 40; index += 1) {
      expect(useCallStore.getState().fenceTerminalCall(`fence-${index}`, generation)).toBe(true);
    }
    const wallClock = vi.spyOn(Date, "now");

    wallClock.mockReturnValue(wallBase + 3_600_000);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(true);
    wallClock.mockReturnValue(wallBase + 1_000);
    await emit(delayedInvite);

    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
  });

  it("persists overflow and fail-closes an unseen invite after restart", async () => {
    const generation = useCallStore.getState().generation;
    for (let index = 0; index < 65; index += 1) {
      expect(useCallStore.getState().fenceTerminalCall(`fence-${index}`, generation)).toBe(true);
    }
    await act(async () => renderer?.unmount());
    renderer = null;
    useCallStore.setState((state) => ({
      accountId: null,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
    }));
    useCallStore.getState().observeAccount(ACCOUNT);
    await useCallStore.getState().hydrateTerminalCallFences(
      ACCOUNT,
      useCallStore.getState().generation,
    );
    await act(async () => {
      renderer = create(createElement(Harness));
    });

    await emit(invite(CALL, CAPABILITY));

    expect(useCallStore.getState().terminalCallFences.size).toBe(65);
    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
  });

  it("does not ring again after an accepted call ends", async () => {
    const delayedInvite = invite(CALL, CAPABILITY);
    await emit(delayedInvite);
    await expect(useCallStore.getState().acceptCall(
      CALL,
      useCallStore.getState().generation,
    )).resolves.toBe(true);
    const generation = useCallStore.getState().generation;

    expect(useCallStore.getState().clearCall(CALL, generation)).toBe(true);
    await emit(delayedInvite);

    expect(useCallStore.getState().activeCall).toBeNull();
    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
  });

  it("fences an expired delivered invite before its local timeout clears", async () => {
    vi.useFakeTimers();
    await emit(invite(CALL, CAPABILITY));
    const generation = useCallStore.getState().generation;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(useCallStore.getState().incomingInvite).toBeNull();
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(true);
  });

  it("learns a terminal call-topic outcome and clears matching active UI", async () => {
    await emit(invite(CALL, CAPABILITY));
    await expect(useCallStore.getState().acceptCall(
      CALL,
      useCallStore.getState().generation,
    )).resolves.toBe(true);
    const generation = useCallStore.getState().generation;

    await emit(terminal("end"));

    expect(useCallStore.getState().activeCall).toBeNull();
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(true);
  });

  it("rejects wrong actor, thread, capability, and replayed terminal fences", async () => {
    await emit(invite(CALL, CAPABILITY));
    const generation = useCallStore.getState().generation;

    await emit(terminal("cancel", { fromUserId: ACCOUNT }));
    await emit(terminal("cancel", { threadId: OTHER_CALL }));
    await emit(terminal("cancel", { capability: OTHER_CAPABILITY }));
    await emit(terminal("cancel", { sequence: 1 }));

    expect(useCallStore.getState().incomingInvite?.callId).toBe(CALL);
    expect(useCallStore.getState().isTerminalCallFenced(CALL, generation)).toBe(false);
  });
});
