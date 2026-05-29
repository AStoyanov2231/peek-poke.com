"use client";
/**
 * CallView — full-screen video call overlay.
 *
 * Rendered by CallProvider when activeCall is non-null.
 * Mounts useWebRTCCall which manages the RTCPeerConnection and MediaStreams.
 *
 * Layout:
 *  ┌──────────────────────────┐
 *  │  [back] Avatar  Name     │  ← top overlay (gradient scrim)
 *  │       remote video       │
 *  │                  ┌────┐  │
 *  │                  │self│  │  ← draggable PiP (framer-motion)
 *  │                  └────┘  │
 *  │  [mic] [cam]  [END] [flip]│  ← controls (gradient scrim)
 *  └──────────────────────────┘
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, VideoOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DraggableSelfView } from "@/components/call/DraggableSelfView";
import { CallControls } from "@/components/call/CallControls";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";
import { useCallStore, type ActiveCall } from "@/stores/callStore";
import { useProfile } from "@/stores/selectors";

interface CallViewProps {
  call: ActiveCall;
}

function useCallTimer(isConnected: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!isConnected) return;
    const iv = setInterval(() => setSeconds((s) => s + 1), 1_000);
    return () => clearInterval(iv);
  }, [isConnected]);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function CallView({ call }: CallViewProps) {
  const { threadId, callId, direction, peer, status } = call;
  const clearCall = useCallStore((s) => s.clearCall);
  const selfProfile = useProfile();
  const containerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timer = useCallTimer(status === "connected");

  const {
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
  } = useWebRTCCall({ threadId, callId, direction });

  // Attach remote stream to video element
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStream ?? null;
    if (remoteStream) video.play().catch(() => {});
  }, [remoteStream]);

  const peerName = peer.display_name || peer.username;

  const statusText = (() => {
    switch (status) {
      case "calling":    return "Calling…";
      case "connecting": return "Connecting…";
      case "connected":  return timer;
      case "ended":      return "Call ended";
      case "failed":     return permissionError ?? "Call failed";
      default:           return "";
    }
  })();

  // If failed, auto-dismiss after 2 s so the user isn't stuck
  useEffect(() => {
    if (status !== "failed") return;
    const t = setTimeout(clearCall, 2_500);
    return () => clearTimeout(t);
  }, [status, clearCall]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] overflow-hidden bg-black select-none"
    >
      {/* ── Remote video (full-bleed) ── */}
      {status === "connected" && !remoteStream ? null : (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* ── Connecting / calling placeholder (no remote yet) ── */}
      {status !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            {status === "calling" && (
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: "rgba(255,255,255,0.1)" }}
              />
            )}
            <Avatar className="relative h-24 w-24">
              {peer.avatar_url && (
                <AvatarImage src={peer.avatar_url} alt={peerName} />
              )}
              <AvatarFallback name={peerName} className="text-2xl" />
            </Avatar>
          </div>
          <p className="text-white/70 text-sm">{statusText}</p>
        </div>
      )}

      {/* ── Remote camera-off placeholder (call connected but no video) ── */}
      {status === "connected" && !remoteStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Avatar className="h-20 w-20">
            {peer.avatar_url && (
              <AvatarImage src={peer.avatar_url} alt={peerName} />
            )}
            <AvatarFallback name={peerName} className="text-xl" />
          </Avatar>
          <VideoOff size={18} className="text-white/50" />
        </div>
      )}

      {/* ── Draggable self-view PiP ── */}
      <DraggableSelfView
        stream={localStream}
        isCameraOff={isCameraOff}
        selfProfile={selfProfile}
        containerRef={containerRef}
      />

      {/* ── Top overlay: who you're on a call with ── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 14px)",
          paddingBottom: 16,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)",
        }}
      >
        {/* Dismiss — goes back to chat but does NOT end the call
            (tap End Call button to hang up) */}
        <button
          onClick={clearCall}
          aria-label="Minimise call view"
          className="iconbtn iconbtn-ghost"
          style={{ color: "#fff" }}
        >
          <ChevronDown size={22} />
        </button>

        <Avatar className="h-9 w-9 flex-shrink-0">
          {peer.avatar_url && (
            <AvatarImage src={peer.avatar_url} alt={peerName} />
          )}
          <AvatarFallback name={peerName} />
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{peerName}</p>
          <p className="text-white/60 text-xs">{statusText}</p>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <CallControls
        isMicMuted={isMicMuted}
        isCameraOff={isCameraOff}
        hasMultipleCameras={hasMultipleCameras}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onFlipCamera={flipCamera}
        onEndCall={endCall}
      />
    </div>
  );
}
