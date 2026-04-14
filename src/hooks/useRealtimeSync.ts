"use client";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading } from "@/stores/selectors";
import { useRealtimeDM } from "@/hooks/useRealtimeDM";
import { useRealtimeFriendships } from "@/hooks/useRealtimeFriendships";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";

/**
 * Orchestrator hook that sets up all realtime Supabase channel subscriptions.
 *
 * Delegates to three focused sub-hooks:
 *  - useRealtimeDM: DM messages channel + visibility change handler
 *  - useRealtimeFriendships: Friendships channel
 *  - useRealtimeProfiles: Profile updates channel
 *
 * Each sub-hook manages its own channel lifecycle and cleanup.
 */
export function useRealtimeSync() {
  const isPreloading = useIsPreloading();

  // DM messages store actions
  const addMessage = useAppStore((state) => state.addMessage);
  const updateMessage = useAppStore((state) => state.updateMessage);
  const setThreads = useAppStore((state) => state.setThreads);
  const updateTotalUnread = useAppStore((state) => state.updateTotalUnread);

  // Friends store actions
  const setFriends = useAppStore((state) => state.setFriends);
  const setRequests = useAppStore((state) => state.setRequests);
  const setSentRequests = useAppStore((state) => state.setSentRequests);
  const updateStats = useAppStore((state) => state.updateStats);

  useRealtimeDM({
    addMessage,
    updateMessage,
    setThreads,
    updateTotalUnread,
    isPreloading,
  });

  useRealtimeFriendships({
    setFriends,
    setRequests,
    setSentRequests,
    updateStats,
    isPreloading,
  });

  useRealtimeProfiles({ isPreloading });
}
