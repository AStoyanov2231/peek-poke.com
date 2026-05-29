"use client";
/**
 * useWebRTCCall — core WebRTC peer-to-peer call hook.
 *
 * Responsibilities:
 *  - Acquire local camera + mic (getUserMedia)
 *  - Build and manage RTCPeerConnection
 *  - Subscribe to Supabase Realtime `call:<threadId>` signaling channel
 *  - Execute offer/answer/ICE trickle exchange
 *  - Provide controls: toggleMic, toggleCamera, flipCamera, endCall
 *
 * Safeguards implemented:
 *  1. ICE candidate queue — buffered until setRemoteDescription completes
 *  2. Gate sends on SUBSCRIBED — queued if channel not yet subscribed
 *  3. Strict-mode guard via isSetupRef — prevents double-initialisation in dev
 *  4. Self-view muted — echoes prevented at the video element level (not here)
 *  5. getUserMedia failure → permissionError state + setCallStatus('failed')
 *  6. Ring timeout and end → teardown + clearCall
 *  7. beforeunload teardown — sends 'end' and stops tracks
 *  8. Flip camera via replaceTrack — no renegotiation needed
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getIceServers } from "@/lib/webrtc/iceServers";
import {
  CALL_SIGNAL_EVENT,
  type SignalingEvent,
} from "@/lib/webrtc/signaling";
import { useCallStore, type CallDirection } from "@/stores/callStore";

const supabase = createClient();

interface UseWebRTCCallParams {
  threadId: string;
  callId: string;
  direction: CallDirection;
}

interface UseWebRTCCallResult {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  hasMultipleCameras: boolean;
  permissionError: string | null;
  toggleMic: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  endCall: () => void;
}

export function useWebRTCCall({
  threadId,
  callId,
  direction,
}: UseWebRTCCallParams): UseWebRTCCallResult {
  // ── Non-serializable refs (never in Zustand) ──────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);
  const isSetupRef = useRef(false);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef(false);
  const facingModeRef = useRef<"user" | "environment">("user");
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSignals = useRef<SignalingEvent[]>([]);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // ── Store actions ──────────────────────────────────────────────────────────
  const setCallStatus = useCallStore((s) => s.setCallStatus);
  const clearCall = useCallStore((s) => s.clearCall);

  // ── Helpers (stable refs, use ref values not state) ────────────────────────
  const sendSignal = useCallback((event: SignalingEvent) => {
    if (!isSubscribedRef.current) {
      pendingSignals.current.push(event);
      return;
    }
    channelRef.current
      ?.send({ type: "broadcast", event: CALL_SIGNAL_EVENT, payload: event })
      .catch(console.error);
  }, []);

  const flushIceQueue = useCallback(async (pc: RTCPeerConnection) => {
    const queued = iceQueueRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("addIceCandidate (queued) failed:", err);
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    isSubscribedRef.current = false;
    hasRemoteDescRef.current = false;
    iceQueueRef.current = [];
    pendingSignals.current = [];
  }, []);

  // ── Main setup effect ──────────────────────────────────────────────────────
  useEffect(() => {
    // Strict-mode guard — only run once per real mount
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    let isMounted = true;

    async function setup() {
      // 1. Acquire local media
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch {
        if (!isMounted) return;
        setPermissionError(
          "Camera or microphone access denied. Check your browser settings."
        );
        setCallStatus("failed");
        return;
      }

      if (!isMounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Check number of cameras (enumerate after permission granted for labels)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (isMounted) {
          setHasMultipleCameras(
            devices.filter((d) => d.kind === "videoinput").length > 1
          );
        }
      } catch {
        // ignore — flip button just stays hidden
      }

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current = pc;

      // Add local tracks to PC
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Remote track handler — surfaces the remote stream for the video element
      pc.ontrack = (evt) => {
        if (!isMounted) return;
        const [rs] = evt.streams;
        if (rs) setRemoteStream(rs);
      };

      // Trickle ICE — send candidates to the peer as they're discovered
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || !isMounted) return;
        sendSignal({ type: "ice", callId, candidate: candidate.toJSON() });
      };

      // Connection-state machine
      pc.onconnectionstatechange = () => {
        if (!isMounted) return;
        if (pc.connectionState === "connected") {
          setCallStatus("connected");
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setCallStatus("failed");
          cleanup();
        }
      };

      // 3. Subscribe to signaling channel
      const channel = supabase
        .channel(`call:${threadId}`, {
          config: { broadcast: { self: false } },
        })
        .on(
          "broadcast",
          { event: CALL_SIGNAL_EVENT },
          async ({ payload }) => {
            if (!isMounted || !payload) return;
            const event = payload as SignalingEvent;

            // Ignore events for a different call session (stale ring)
            if (event.callId !== callId) return;

            const currentPc = pcRef.current;
            if (!currentPc) return;

            switch (event.type) {
              case "accept":
                // Callee accepted — caller creates and sends the offer
                if (direction === "outgoing") {
                  setCallStatus("connecting");
                  try {
                    const offer = await currentPc.createOffer();
                    await currentPc.setLocalDescription(offer);
                    sendSignal({ type: "offer", callId, sdp: offer });
                  } catch (err) {
                    console.error("createOffer failed:", err);
                    setCallStatus("failed");
                    cleanup();
                  }
                }
                break;

              case "offer":
                // Caller sent offer — callee answers
                if (direction === "incoming") {
                  try {
                    await currentPc.setRemoteDescription(
                      new RTCSessionDescription(event.sdp)
                    );
                    hasRemoteDescRef.current = true;
                    await flushIceQueue(currentPc);
                    const answer = await currentPc.createAnswer();
                    await currentPc.setLocalDescription(answer);
                    sendSignal({ type: "answer", callId, sdp: answer });
                  } catch (err) {
                    console.error("offer processing failed:", err);
                    setCallStatus("failed");
                    cleanup();
                  }
                }
                break;

              case "answer":
                // Callee answered — caller completes handshake
                if (direction === "outgoing") {
                  try {
                    await currentPc.setRemoteDescription(
                      new RTCSessionDescription(event.sdp)
                    );
                    hasRemoteDescRef.current = true;
                    await flushIceQueue(currentPc);
                  } catch (err) {
                    console.error("answer processing failed:", err);
                  }
                }
                break;

              case "ice":
                // Trickle ICE — queue if remote description not set yet
                if (hasRemoteDescRef.current) {
                  try {
                    await currentPc.addIceCandidate(
                      new RTCIceCandidate(event.candidate)
                    );
                  } catch (err) {
                    console.warn("addIceCandidate failed:", err);
                  }
                } else {
                  iceQueueRef.current.push(event.candidate);
                }
                break;

              case "end":
              case "reject":
                cleanup();
                clearCall();
                break;
            }
          }
        );

      channel.subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || !isMounted) return;

        isSubscribedRef.current = true;
        channelRef.current = channel;

        // Flush any signals that were queued before subscription completed
        const queued = pendingSignals.current.splice(0);
        for (const event of queued) {
          channel
            .send({ type: "broadcast", event: CALL_SIGNAL_EVENT, payload: event })
            .catch(console.error);
        }

        if (direction === "incoming") {
          // Callee: send accept so the caller knows to create an offer
          sendSignal({ type: "accept", callId });
        } else {
          // Caller: post invite to server (broadcasts ring + sends push to callee)
          try {
            const res = await fetch(`/api/dm/${threadId}/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "invite", callId }),
            });
            if (!res.ok && isMounted) {
              setCallStatus("failed");
              cleanup();
              return;
            }
          } catch {
            if (isMounted) {
              setCallStatus("failed");
              cleanup();
            }
            return;
          }

          // 30-second ring timeout — cancel if callee doesn't answer
          ringTimeoutRef.current = setTimeout(() => {
            if (pcRef.current?.connectionState === "connected") return;
            fetch(`/api/dm/${threadId}/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "cancel", callId }),
            }).catch(() => {});
            cleanup();
            clearCall();
          }, 30_000);
        }
      });

      // Keep a ref immediately so beforeunload can clean up even before SUBSCRIBED
      channelRef.current = channel;
    }

    setup().catch(console.error);

    // Tab-close teardown — send 'end' and stop all tracks
    const handleBeforeUnload = () => {
      if (channelRef.current && isSubscribedRef.current) {
        channelRef.current
          .send({
            type: "broadcast",
            event: CALL_SIGNAL_EVENT,
            payload: { type: "end", callId } satisfies SignalingEvent,
          })
          .catch(() => {});
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      isSetupRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — one run per mount; deps are stable refs

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = !stream.getAudioTracks()[0]?.enabled;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setIsMicMuted(!enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const enabled = !stream.getVideoTracks()[0]?.enabled;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
    setIsCameraOff(!enabled);
  }, []);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;
    if (!stream || !pc) return;

    const newFacing =
      facingModeRef.current === "user" ? "environment" : "user";

    try {
      const newMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: false,
      });
      const [newVideoTrack] = newMediaStream.getVideoTracks();

      // Replace track in the sender — no renegotiation needed
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newVideoTrack);

      // Stop old video track
      const [oldVideoTrack] = stream.getVideoTracks();
      if (oldVideoTrack) {
        stream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }

      stream.addTrack(newVideoTrack);

      // Rebuild the stream object so video srcObject useEffect re-fires
      const freshStream = new MediaStream(stream.getTracks());
      localStreamRef.current = freshStream;
      setLocalStream(freshStream);

      facingModeRef.current = newFacing;
    } catch (err) {
      console.error("flipCamera failed:", err);
    }
  }, []);

  const endCall = useCallback(() => {
    sendSignal({ type: "end", callId });
    cleanup();
    clearCall();
  }, [callId, sendSignal, cleanup, clearCall]);

  return {
    localStream,
    remoteStream,
    isMicMuted,
    isCameraOff,
    hasMultipleCameras,
    permissionError,
    toggleMic,
    toggleCamera,
    flipCamera,
    endCall,
  };
}
