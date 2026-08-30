"use client";

import { useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { postCallSignal } from "@/lib/webrtc/signaling";
import { useCallStore, type IncomingInvite } from "@/stores/callStore";

interface IncomingCallOverlayProps {
  invite: IncomingInvite;
}

export function IncomingCallOverlay({ invite }: IncomingCallOverlayProps) {
  const acceptCall = useCallStore((s) => s.acceptCall);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const { fromUser, callId } = invite;
  const callerName = fromUser.display_name || fromUser.username;

  const handleDecline = async () => {
    if (isDeclining) return;
    setIsDeclining(true);
    setDeclineError(null);
    try {
      const synchronized = await useCallStore.getState()
        .synchronizeTerminalCallFences(invite.accountId, invite.generation);
      const state = useCallStore.getState();
      const current = state.incomingInvite;
      if (
        !synchronized
        || !current
        || current.callId !== callId
        || current.generation !== invite.generation
        || current.accountId !== invite.accountId
        || state.isTerminalCallFenced(callId, invite.generation)
      ) {
        setIsDeclining(false);
        return;
      }
      await postCallSignal(current.threadId, {
        version: 1,
        type: "reject",
        commandId: crypto.randomUUID(),
        callId: current.callId,
        capability: current.capability,
        reason: "declined",
      });
      useCallStore.getState().clearInvite(current.callId, current.generation);
    } catch {
      setDeclineError("Could not decline the call. Check your connection and retry.");
      setIsDeclining(false);
    }
  };

  const handleAccept = async () => {
    if (isAccepting || isDeclining) return;
    setIsAccepting(true);
    const accepted = await acceptCall(callId, invite.generation);
    if (!accepted) setIsAccepting(false);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center"
      style={{
        background: "rgba(10,10,18,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
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
          {declineError && <p role="alert" className="text-red-300 text-xs mt-3">{declineError}</p>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-16">
        {/* Decline */}
        <div className="flex flex-col items-center gap-2">
          <button type="button"
            onClick={handleDecline}
            disabled={isDeclining || isAccepting}
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
          <button type="button"
            onClick={handleAccept}
            disabled={isDeclining || isAccepting}
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
