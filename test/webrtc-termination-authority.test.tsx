import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_TERMINAL_AUTHORITY_TIMEOUT_MS,
  CALL_TERMINAL_TIMEOUT_MS,
} from "@peekpoke/shared";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const COMMAND = "66666666-6666-4666-8666-666666666666";
const GENERATION = 7;

const mocks = vi.hoisted(() => ({
  getUserMedia: vi.fn(),
  postCallSignal: vi.fn(),
  randomUUID: vi.fn(() => COMMAND),
  synchronize: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/lib/webrtc/iceServers", () => ({ getIceServers: vi.fn() }));

vi.mock("@/lib/webrtc/signaling", () => ({
  CALL_SIGNAL_EVENT: "call-signal",
  CallSignalRequestError: class CallSignalRequestError extends Error {
    constructor(public status: number) {
      super("Call signal request failed");
    }
  },
  postCallSignal: mocks.postCallSignal,
}));

import { useWebRTCCall } from "@/features/call/useWebRTCCall";
import { useCallStore, type ActiveCall } from "@/stores/callStore";

const originalSynchronize = useCallStore.getState().synchronizeTerminalCallFences;
const activeCall: ActiveCall = {
  accountId: ACCOUNT,
  generation: GENERATION,
  threadId: THREAD,
  callId: CALL,
  peer: {
    id: PEER,
    display_name: "Peer",
    username: "peer",
    avatar_url: null,
  },
  direction: "outgoing",
  status: "connecting",
  capability: CAPABILITY,
  lastSequence: 1,
};

let renderer: ReactTestRenderer | null = null;
let hook: ReturnType<typeof useWebRTCCall> | null = null;
let consoleError: ReturnType<typeof vi.spyOn>;

function Harness() {
  hook = useWebRTCCall(activeCall);
  return null;
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

function requestDuplicateTermination() {
  act(() => {
    hook?.endCall();
    hook?.endCall();
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", { randomUUID: mocks.randomUUID });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: mocks.getUserMedia,
      enumerateDevices: vi.fn(),
    },
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  });
  mocks.getUserMedia.mockImplementation(() => new Promise(() => undefined));
  mocks.synchronize.mockResolvedValue(true);
  mocks.postCallSignal.mockResolvedValue({
    version: 1,
    callId: CALL,
    threadId: THREAD,
    capability: CAPABILITY,
    acceptedSequence: 2,
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
    replayed: false,
  });
  useCallStore.setState({
    accountId: ACCOUNT,
    generation: GENERATION,
    terminalFenceEpoch: "round152-epoch",
    activeCall,
    incomingInvite: null,
    terminalCallFences: new Map(),
    terminalFencesReady: true,
    synchronizeTerminalCallFences: mocks.synchronize,
  });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await act(async () => {
    renderer = create(createElement(Harness));
  });
  consoleError.mockClear();
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = null;
  hook = null;
  useCallStore.setState({ synchronizeTerminalCallFences: originalSynchronize });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web WebRTC terminal authority integration", () => {
  it("coalesces duplicate teardown behind the bounded pre-factory authority timeout", async () => {
    vi.useFakeTimers();
    mocks.synchronize.mockImplementation(() => new Promise(() => undefined));

    requestDuplicateTermination();
    expect(hook?.isEnding).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CALL_TERMINAL_AUTHORITY_TIMEOUT_MS + 25);
    });

    expect(mocks.synchronize).toHaveBeenCalledOnce();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    expect(hook?.isEnding).toBe(false);
    expect(hook?.permissionError).toBe("Could not end the call session. Check your connection and retry.");
    expect(useCallStore.getState().activeCall?.status).toBe("failed");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("treats a false pre-factory authority result as stale without fake success", async () => {
    mocks.synchronize.mockResolvedValue(false);

    requestDuplicateTermination();
    await flushMicrotasks();

    expect(mocks.synchronize).toHaveBeenCalledOnce();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    expect(hook?.isEnding).toBe(false);
    expect(hook?.permissionError).toBeNull();
    expect(useCallStore.getState().activeCall).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reports a rejected pre-factory authority check once while the call is current", async () => {
    const infrastructureError = new Error("authority unavailable");
    mocks.synchronize.mockRejectedValue(infrastructureError);

    requestDuplicateTermination();
    await flushMicrotasks();

    expect(mocks.synchronize).toHaveBeenCalledOnce();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    expect(hook?.permissionError).toBe("Could not end the call session. Check your connection and retry.");
    expect(useCallStore.getState().activeCall?.status).toBe("failed");
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("reclassifies a rejected pre-factory check as stale after an external fence merge", async () => {
    mocks.synchronize.mockImplementation(async () => {
      useCallStore.setState({
        activeCall: null,
        terminalCallFences: new Map([[CALL, Number.POSITIVE_INFINITY]]),
      });
      throw new Error("storage race");
    });

    requestDuplicateTermination();
    await flushMicrotasks();

    expect(mocks.synchronize).toHaveBeenCalledOnce();
    expect(mocks.postCallSignal).not.toHaveBeenCalled();
    expect(hook?.isEnding).toBe(false);
    expect(hook?.permissionError).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("bounds a held terminal network request with the overall queue deadline", async () => {
    vi.useFakeTimers();
    mocks.postCallSignal.mockImplementation(() => new Promise(() => undefined));

    requestDuplicateTermination();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });
    expect(mocks.postCallSignal).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CALL_TERMINAL_TIMEOUT_MS);
    });

    expect(mocks.postCallSignal).toHaveBeenCalledOnce();
    expect(hook?.isEnding).toBe(false);
    expect(hook?.permissionError).toBe("Could not end the call session. Check your connection and retry.");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
