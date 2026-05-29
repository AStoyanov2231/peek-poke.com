"use client";

import { useEffect } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { isNativeApp } from "@/lib/native";
import { useCallStore, type IncomingInvite } from "@/stores/callStore";

interface IncomingCallOverlayProps {
  invite: IncomingInvite;
}

export function IncomingCallOverlay({ invite }: IncomingCallOverlayProps) {
  const acceptCall = useCallStore((s) => s.acceptCall);
  const declineCall = useCallStore((s) => s.declineCall);

  const { fromUser, threadId, callId } = invite;
  const callerName = fromUser.display_name || fromUser.username;

  // Haptic feedback on ring (iOS)
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;

    const pulse = async () => {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      while (!cancelled) {
        await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    pulse();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDecline = async () => {
    // Tell the caller we declined (server broadcasts reject on the call channel)
    fetch(`/api/dm/${threadId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", callId }),
    }).catch(() => {});
    declineCall();
  };

  const handleAccept = () => {
    acceptCall();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center"
      style={{
        background: "rgba(10,10,18,0.92)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Caller info */}
      <div className="flex flex-col items-center gap-4 mb-16">
        {/* Pulsing ring animation */}
        <div className="relative">
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
          <Avatar className="relative h-24 w-24">
            {fromUser.avatar_url && (
              <AvatarImage src={fromUser.avatar_url} alt={callerName} />
            )}
            <AvatarFallback name={callerName} className="text-2xl" />
          </Avatar>
        </div>
        <div className="text-center">
          <p className="text-white text-2xl font-semibold">{callerName}</p>
          <p className="text-white/60 text-sm mt-1">Incoming video call</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-16">
        {/* Decline */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleDecline}
            aria-label="Decline call"
            className="iconbtn iconbtn-lg"
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "var(--danger-500)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            <PhoneOff size={26} />
          </button>
          <span className="text-white/60 text-xs">Decline</span>
        </div>

        {/* Accept */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleAccept}
            aria-label="Accept call"
            className="iconbtn iconbtn-lg"
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "var(--success-500)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            <Phone size={26} />
          </button>
          <span className="text-white/60 text-xs">Accept</span>
        </div>
      </div>
    </div>
  );
}
