import { ApiRequestError, apiFetch } from "./api";
import {
  CALL_SIGNAL_EVENT,
  CALL_SIGNAL_ATTEMPT_TIMEOUT_MS,
  MAX_CALL_CLOCK_SKEW_MS,
  MAX_CALL_EVENT_LIFETIME_MS,
  RING_SIGNAL_EVENT,
  callSignalAckSchema,
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

export async function postNativeCallSignal(
  threadId: string,
  command: CallSignalCommand,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ack = await apiFetch<CallSignalAck>(`/api/dm/${encodeURIComponent(threadId)}/call`, {
        method: "POST",
        body: JSON.stringify(command),
        responseSchema: callSignalAckSchema,
        signal,
        timeoutMs: CALL_SIGNAL_ATTEMPT_TIMEOUT_MS,
      });
      const expiresAt = Date.parse(ack.expiresAt);
      const now = Date.now();
      if (ack.callId !== command.callId
        || ack.threadId !== threadId
        || expiresAt <= now
        || expiresAt > now + MAX_CALL_EVENT_LIFETIME_MS + MAX_CALL_CLOCK_SKEW_MS) {
        throw new ApiRequestError("Invalid call signaling response", 502, "INVALID_RESPONSE");
      }
      return ack;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (attempt > 0 || (error instanceof ApiRequestError && error.status > 0 && error.status < 500)) {
        throw error;
      }
    }
  }
  throw new Error("Call signaling failed");
}

type IceServer = { urls: string | string[]; username?: string; credential?: string };

export async function getIceServers(): Promise<IceServer[]> {
  try {
    const payload = await apiFetch<{ iceServers?: IceServer[] }>("/api/webrtc/ice-servers");
    if (payload.iceServers?.length) return payload.iceServers;
  } catch (error) {
    console.warn("Falling back to STUN-only calling:", error);
  }
  return [{ urls: ["stun:stun.l.google.com:19302"] }];
}
