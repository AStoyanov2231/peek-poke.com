import {
  CALL_SIGNAL_EVENT,
  CALL_SIGNAL_ATTEMPT_TIMEOUT_MS,
  MAX_CALL_CLOCK_SKEW_MS,
  MAX_CALL_EVENT_LIFETIME_MS,
  RING_SIGNAL_EVENT,
  callSignalAckSchema,
  createRequestSignal,
  type CallDirection,
  type CallPeerInfo,
  type CallSignalAck,
  type CallSignalCommand,
  type CallSignalEvent,
  type CallStatus,
} from "@peekpoke/shared";

export {
  CALL_SIGNAL_EVENT,
  RING_SIGNAL_EVENT,
  type CallDirection,
  type CallPeerInfo,
  type CallSignalAck,
  type CallSignalCommand,
  type CallSignalEvent,
  type CallStatus,
};

export class CallSignalRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Call signaling failed with ${status}`);
    this.name = "CallSignalRequestError";
  }
}

export class CallSignalTimeoutError extends Error {
  constructor() {
    super("Call signaling request timed out");
    this.name = "CallSignalTimeoutError";
  }
}

export async function postCallSignal(
  threadId: string,
  command: CallSignalCommand,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestSignal = createRequestSignal(signal, CALL_SIGNAL_ATTEMPT_TIMEOUT_MS);
    let receivedResponse = false;
    try {
      const response = await raceWithAbort(fetch(`/api/dm/${encodeURIComponent(threadId)}/call`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
          keepalive: command.type === "cancel"
            || command.type === "recover-cancel"
            || command.type === "reject"
            || command.type === "end",
          signal: requestSignal.signal,
        }), requestSignal.signal);
      receivedResponse = true;
      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) continue;
        throw new CallSignalRequestError(response.status);
      }
      const payload = await raceWithAbort(response.json(), requestSignal.signal);
      const parsed = callSignalAckSchema.safeParse(payload);
      if (!parsed.success || parsed.data.callId !== command.callId || parsed.data.threadId !== threadId) {
        throw new Error("Invalid call signaling response");
      }
      const expiresAt = Date.parse(parsed.data.expiresAt);
      const now = Date.now();
      if (expiresAt <= now || expiresAt > now + MAX_CALL_EVENT_LIFETIME_MS + MAX_CALL_CLOCK_SKEW_MS) {
        throw new Error("Expired call signaling response");
      }
      return parsed.data;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (error instanceof CallSignalRequestError) throw error;
      if (receivedResponse && !requestSignal.didTimeout()) throw error;
      if (attempt > 0) {
        if (requestSignal.didTimeout()) throw new CallSignalTimeoutError();
        throw error;
      }
      continue;
    } finally {
      requestSignal.cleanup();
    }
  }
  throw new Error("Call signaling failed");
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new CallSignalTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new CallSignalTimeoutError());
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
