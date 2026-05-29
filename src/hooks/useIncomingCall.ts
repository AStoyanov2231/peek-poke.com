"use client";
/**
 * useIncomingCall — global hook that listens for ring events on the personal channel.
 *
 * Mounted in DeferredEffects (PreloadProvider) so it's always active while the user
 * is signed in. When an invite arrives:
 *  - If already in a call → auto-sends reject (busy) via the server
 *  - Otherwise → sets incomingInvite in callStore (renders IncomingCallOverlay)
 *
 * When a cancel arrives → clears the invite if callId matches.
 * 30-second timeout → auto-dismiss if the user doesn't respond.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsPreloading } from "@/stores/selectors";
import { useCallStore } from "@/stores/callStore";
import { RING_SIGNAL_EVENT, type RingPayload } from "@/lib/webrtc/signaling";

const supabase = createClient();
const RING_TIMEOUT_MS = 30_000;

export function useIncomingCall(userId: string | undefined) {
  const isPreloading = useIsPreloading();
  const setIncomingInvite = useCallStore((s) => s.setIncomingInvite);
  const isSetupRef = useRef(false);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPreloading || !userId || isSetupRef.current) return;
    isSetupRef.current = true;

    const channel = supabase
      .channel(`calls:user:${userId}`)
      .on("broadcast", { event: RING_SIGNAL_EVENT }, ({ payload }) => {
        if (!payload) return;
        const event = payload as RingPayload;

        if (event.type === "invite") {
          // Already in a call → auto-reject (busy)
          const currentActiveCall = useCallStore.getState().activeCall;
          if (currentActiveCall) {
            fetch(`/api/dm/${event.threadId}/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "reject",
                callId: event.callId,
              }),
            }).catch(() => {});
            return;
          }

          // Replace any existing invite (only one ring at a time)
          if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

          setIncomingInvite({
            threadId: event.threadId,
            callId: event.callId,
            fromUser: event.fromUser,
          });

          // Auto-dismiss after 30 s (caller will have timed out too)
          ringTimeoutRef.current = setTimeout(() => {
            const current = useCallStore.getState().incomingInvite;
            if (current?.callId === event.callId) {
              useCallStore.getState().clearInvite();
            }
          }, RING_TIMEOUT_MS);
        } else if (event.type === "cancel") {
          const current = useCallStore.getState().incomingInvite;
          if (current?.callId === event.callId) {
            if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
            useCallStore.getState().clearInvite();
          }
        }
      })
      .subscribe();

    return () => {
      isSetupRef.current = false;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [isPreloading, userId, setIncomingInvite]);
}
