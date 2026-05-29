/**
 * Shared types for WebRTC signaling over Supabase Realtime broadcast.
 *
 * Two channels:
 *  - `calls:user:<recipientId>` — ring/discovery (server → client only).
 *    Events: 'ring-invite'
 *  - `call:<threadId>` — per-call handshake (both peers, client-direct).
 *    Events: 'call-signal'
 */

/** Minimal peer info included in ring and call payloads */
export type CallPeerInfo = {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
};

/** Events on the `call:<threadId>` signaling channel */
export type SignalingEvent =
  | { type: "accept"; callId: string }
  | { type: "reject"; callId: string; reason?: string }
  | { type: "offer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; callId: string; candidate: RTCIceCandidateInit }
  | { type: "end"; callId: string };

/** Events on the `calls:user:<userId>` ring channel (server-sent only) */
export type RingPayload =
  | { type: "invite"; callId: string; threadId: string; fromUser: CallPeerInfo }
  | { type: "cancel"; callId: string };

/** Supabase broadcast event name for per-call signaling */
export const CALL_SIGNAL_EVENT = "call-signal";

/** Supabase broadcast event name for ring/discovery */
export const RING_SIGNAL_EVENT = "ring-invite";
