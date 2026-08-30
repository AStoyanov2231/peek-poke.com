"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const TYPING_SEND_INTERVAL_MS = 2_000;

export function useTypingIndicator(threadId: string, userId: string | undefined) {
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAt = useRef(0);

  // The fluent channel subscription is explicitly unsubscribed and removed
  // in the cleanup below.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!threadId || !userId) return;
    const channel = supabase.channel(`thread:${threadId}`, {
      config: { private: true },
    });
    const subscription = channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.userId === userId || typeof payload.expiresAt !== "string") return;
      const expiresAt = new Date(payload.expiresAt).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
      setIsPeerTyping(true);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(
        () => setIsPeerTyping(false),
        Math.min(5_000, Math.max(0, expiresAt - Date.now())),
      );
    }).subscribe();
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      void subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [threadId, userId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!threadId || now - lastSentAt.current < TYPING_SEND_INTERVAL_MS) return;
    lastSentAt.current = now;
    void fetch(`/api/dm/${encodeURIComponent(threadId)}/typing`, {
      method: "POST",
    });
  }, [threadId]);

  return { isPeerTyping, notifyTyping };
}
