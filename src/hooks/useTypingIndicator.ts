"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const TYPING_EXPIRY_MS = 3000;
const SEND_DEBOUNCE_MS = 2000;

export function useTypingIndicator(threadId: string | null) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`thread:${threadId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const userId = payload?.userId as string | undefined;
        if (!userId) return;

        setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));

        // Clear existing timer for this user
        const existing = timersRef.current.get(userId);
        if (existing) clearTimeout(existing);

        // Auto-remove after expiry
        const timer = setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((id) => id !== userId));
          timersRef.current.delete(userId);
        }, TYPING_EXPIRY_MS);

        timersRef.current.set(userId, timer);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
      setTypingUserIds([]);
    };
  }, [threadId]);

  const sendTyping = useCallback(() => {
    if (!threadId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_DEBOUNCE_MS) return;
    lastSentRef.current = now;

    fetch(`/api/dm/${threadId}/typing`, { method: "POST" }).catch(() => {});
  }, [threadId]);

  return { typingUserIds, sendTyping };
}
