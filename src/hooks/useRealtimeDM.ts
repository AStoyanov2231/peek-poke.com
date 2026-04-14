"use client";
import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";
import type { Thread } from "@/stores/appStore";
import type { DMMessage, Profile } from "@/types/database";

const supabase = createClient();

// Helper to find a known profile from cached sources
export function getKnownProfile(senderId: string): Profile | undefined {
  const state = useAppStore.getState();

  // Check current user
  if (state.profile?.id === senderId) return state.profile;

  // Check profile cache
  if (state.profileCache[senderId]) return state.profileCache[senderId];

  // Check friends list
  const friend = state.friends.find((f) => f.id === senderId);
  if (friend) return friend;

  // Check DM thread participants
  for (const thread of state.threads) {
    if (thread.participant_1?.id === senderId) return thread.participant_1;
    if (thread.participant_2?.id === senderId) return thread.participant_2;
  }

  // Check existing messages for sender profile
  for (const messages of Object.values(state.threadMessages)) {
    const msgWithSender = messages.find(
      (m) => m.sender_id === senderId && "sender" in m && m.sender
    );
    if (msgWithSender && "sender" in msgWithSender && msgWithSender.sender) {
      return msgWithSender.sender;
    }
  }

  return undefined;
}

// Async fetch and cache for unknown profiles via API
export async function fetchAndCacheProfile(senderId: string): Promise<Profile | null> {
  try {
    const res = await fetch(`/api/profile/${senderId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.profile) {
      useAppStore.getState().cacheProfile(data.profile);
      return data.profile;
    }
  } catch {
    // Silently fail — profile will be fetched on next attempt
  }
  return null;
}

// Throttle visibility change refetches to once per 30 seconds
const VISIBILITY_THROTTLE_MS = 30000;
// Debounce refetchThreads to prevent excessive API calls
const REFETCH_DEBOUNCE_MS = 500;

interface UseRealtimeDMParams {
  addMessage: (threadId: string, message: DMMessage) => void;
  updateMessage: (threadId: string, messageId: string, updates: Partial<DMMessage>) => void;
  setThreads: (threads: Thread[]) => void;
  updateTotalUnread: (count: number) => void;
  isPreloading: boolean;
}

export function useRealtimeDM({
  addMessage,
  updateMessage,
  setThreads,
  updateTotalUnread,
  isPreloading,
}: UseRealtimeDMParams) {
  const isSetupRef = useRef<boolean>(false);
  const refetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastVisibilityFetchRef = useRef<number>(0);

  const refetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/dm/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
        updateTotalUnread(data.total_unread || 0);
      }
    } catch (error) {
      console.error("Failed to refetch threads:", error);
    }
  }, [setThreads, updateTotalUnread]);

  const debouncedRefetchThreads = useCallback(() => {
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
    }
    refetchDebounceRef.current = setTimeout(() => {
      refetchThreads();
    }, REFETCH_DEBOUNCE_MS);
  }, [refetchThreads]);

  useEffect(() => {
    if (isPreloading) return;
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    let isMounted = true;

    // Channel for DM messages - handle INSERT and UPDATE events
    const dmMessagesChannel = supabase
      .channel("global-dm-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
        },
        (payload) => {
          if (!isMounted) return;
          const rawMsg = payload.new as DMMessage;

          // Enrich message with sender profile from cached sources (avoid mutating payload)
          const sender = getKnownProfile(rawMsg.sender_id);
          const msg = sender ? { ...rawMsg, sender } : rawMsg;
          addMessage(msg.thread_id, msg);

          // Fetch profile asynchronously if not found in cache
          if (!sender) {
            fetchAndCacheProfile(rawMsg.sender_id)
              .then((profile) => {
                if (profile && isMounted) {
                  updateMessage(rawMsg.thread_id, rawMsg.id, { sender: profile });
                }
              })
              .catch((error) => {
                console.error("Failed to fetch sender profile:", error);
              });
          }

          // Check if user is viewing this thread - auto-mark read
          const { activeThreadId, profile, markThreadRead } = useAppStore.getState();
          if (activeThreadId === msg.thread_id && profile && msg.sender_id !== profile.id) {
            fetch(`/api/dm/${msg.thread_id}/read`, { method: "POST" })
              .then((res) => { if (res.ok) markThreadRead(msg.thread_id); })
              .catch(() => {});
          }

          // Debounced refetch to update unread counts and thread order
          debouncedRefetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_messages",
        },
        (payload) => {
          if (!isMounted) return;
          const msg = payload.new as DMMessage;
          // Update the message in store (handles edit and soft delete)
          updateMessage(msg.thread_id, msg.id, msg);
        }
      )
      .subscribe();

    // Handle visibility changes (mobile background/foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMounted) {
        const now = Date.now();
        if (now - lastVisibilityFetchRef.current > VISIBILITY_THROTTLE_MS) {
          lastVisibilityFetchRef.current = now;
          // Soft refresh - update threads and unread counts
          refetchThreads();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      isSetupRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
      }
      supabase.removeChannel(dmMessagesChannel);
    };
  }, [isPreloading, addMessage, updateMessage, debouncedRefetchThreads, refetchThreads]);
}
