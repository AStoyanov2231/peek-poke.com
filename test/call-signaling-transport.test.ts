import { afterEach, describe, expect, it, vi } from "vitest";
import { CALL_SIGNAL_ATTEMPT_TIMEOUT_MS } from "@peekpoke/shared";
import { CallSignalTimeoutError, postCallSignal } from "@/lib/webrtc/signaling";

const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const COMMAND = "66666666-6666-4666-8666-666666666666";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";

describe("web call signaling recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a transient failure with the exact idempotency command", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: 1,
        callId: CALL,
        threadId: THREAD,
        capability: CAPABILITY,
        acceptedSequence: 1,
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        replayed: true,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const command = { version: 1 as const, type: "invite" as const, commandId: COMMAND, callId: CALL };

    await expect(postCallSignal(THREAD, command)).resolves.toMatchObject({ replayed: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(command));
  });

  it("does not retry authorization or state conflicts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postCallSignal(THREAD, {
      version: 1,
      type: "end",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    })).rejects.toThrow("409");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds a transport that never resolves and preserves the two-attempt budget", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const pending = postCallSignal(THREAD, {
      version: 1,
      type: "heartbeat",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    });
    const timedOut = expect(pending).rejects.toBeInstanceOf(CallSignalTimeoutError);

    await vi.advanceTimersByTimeAsync(CALL_SIGNAL_ATTEMPT_TIMEOUT_MS * 2);
    await timedOut;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(fetchMock.mock.calls[1]?.[1]?.body);
  });

  it("composes an external abort with its internal command deadline", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const reason = new Error("account switched");
    const pending = postCallSignal(THREAD, {
      version: 1,
      type: "ice",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
      candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ host" },
    }, controller.signal);

    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps capability-free recovery alive during page teardown with exact retry identity", async () => {
    const ack = {
      version: 1,
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      acceptedSequence: 2,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
      replayed: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ack), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const command = {
      version: 1 as const,
      type: "recover-cancel" as const,
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: CAPABILITY,
    };

    await expect(postCallSignal(THREAD, command)).resolves.toEqual(ack);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.keepalive).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(command));
  });
});
