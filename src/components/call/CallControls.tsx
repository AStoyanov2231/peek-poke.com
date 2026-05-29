"use client";

import { Mic, MicOff, Video, VideoOff, SwitchCamera, PhoneOff } from "lucide-react";

interface CallControlsProps {
  isMicMuted: boolean;
  isCameraOff: boolean;
  hasMultipleCameras: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onEndCall: () => void;
}

export function CallControls({
  isMicMuted,
  isCameraOff,
  hasMultipleCameras,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onEndCall,
}: CallControlsProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-5 px-6"
      style={{
        paddingBottom: "calc(var(--safe-area-bottom) + 32px)",
        paddingTop: 24,
        background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
      }}
    >
      {/* Mute mic */}
      <button
        onClick={onToggleMic}
        aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
        className="iconbtn iconbtn-lg"
        style={{
          background: isMicMuted ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)",
          color: "#fff",
          boxShadow: "none",
        }}
      >
        {isMicMuted ? <MicOff size={22} /> : <Mic size={22} />}
      </button>

      {/* Toggle camera */}
      <button
        onClick={onToggleCamera}
        aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
        className="iconbtn iconbtn-lg"
        style={{
          background: isCameraOff ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)",
          color: "#fff",
          boxShadow: "none",
        }}
      >
        {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
      </button>

      {/* End call — larger, red, centre prominence */}
      <button
        onClick={onEndCall}
        aria-label="End call"
        className="iconbtn"
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          background: "var(--danger-500)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <PhoneOff size={26} />
      </button>

      {/* Flip camera — only shown when multiple cameras available */}
      <button
        onClick={onFlipCamera}
        aria-label="Flip camera"
        className="iconbtn iconbtn-lg"
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          boxShadow: "none",
          visibility: hasMultipleCameras ? "visible" : "hidden",
        }}
      >
        <SwitchCamera size={22} />
      </button>

      {/* Spacer to balance the layout when flip is hidden */}
      {!hasMultipleCameras && <div style={{ width: 48, height: 48 }} />}
    </div>
  );
}
