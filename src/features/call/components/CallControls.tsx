"use client";

import { SwitchCamera, PhoneOff } from "lucide-react";
import type { ReactNode } from "react";

interface CallControlsProps {
  micIcon: ReactNode;
  micLabel: string;
  cameraIcon: ReactNode;
  cameraLabel: string;
  hasMultipleCameras: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onEndCall: () => void;
  isEnding?: boolean;
}

export function CallControlBar({
  micIcon,
  micLabel,
  cameraIcon,
  cameraLabel,
  hasMultipleCameras,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onEndCall,
  isEnding = false,
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
      <button type="button"
        onClick={onToggleMic}
        aria-label={micLabel}
        className="iconbtn iconbtn-lg"
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          boxShadow: "none",
        }}
      >
        {micIcon}
      </button>

      {/* Toggle camera */}
      <button type="button"
        onClick={onToggleCamera}
        aria-label={cameraLabel}
        className="iconbtn iconbtn-lg"
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          boxShadow: "none",
        }}
      >
        {cameraIcon}
      </button>

      {/* End call — larger, red, centre prominence */}
      <button type="button"
        onClick={onEndCall}
        disabled={isEnding}
        aria-label={isEnding ? "Ending call" : "End call"}
        className="iconbtn"
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          background: "var(--danger-500)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          opacity: isEnding ? 0.55 : 1,
        }}
      >
        <PhoneOff size={26} />
      </button>

      {/* Flip camera — only shown when multiple cameras available */}
      <button type="button"
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
