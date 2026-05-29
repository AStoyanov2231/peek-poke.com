"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { VideoOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { CallPeerInfo } from "@/lib/webrtc/signaling";

interface DraggableSelfViewProps {
  stream: MediaStream | null;
  isCameraOff: boolean;
  /** Used for avatar fallback when camera is off */
  selfProfile: { display_name: string | null; username: string; avatar_url: string | null } | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function DraggableSelfView({
  stream,
  isCameraOff,
  selfProfile,
  containerRef,
}: DraggableSelfViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to video element whenever it changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream ?? null;
    if (stream) {
      video.play().catch(() => {});
    }
  }, [stream]);

  const fallbackName = selfProfile?.display_name || selfProfile?.username || "Me";

  return (
    <motion.div
      drag
      dragConstraints={containerRef}
      dragMomentum={false}
      className="call-pip-drag absolute top-20 right-4 z-20 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.5)] cursor-grab active:cursor-grabbing"
      style={{ width: 100, height: 140, touchAction: "none" }}
      whileTap={{ scale: 0.97 }}
    >
      {/* Camera-off placeholder */}
      {isCameraOff && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-8 z-10">
          <Avatar className="h-12 w-12">
            {selfProfile?.avatar_url && (
              <AvatarImage src={selfProfile.avatar_url} alt={fallbackName} />
            )}
            <AvatarFallback name={fallbackName} />
          </Avatar>
          <VideoOff size={14} className="text-white/60" />
        </div>
      )}

      {/* Live self-view — muted to prevent echo */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover bg-black"
        style={{ display: isCameraOff ? "none" : "block" }}
      />
    </motion.div>
  );
}
