"use client";
import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  FriendWithFriendshipId,
  FriendshipWithRequester,
  FriendshipWithAddressee,
} from "@/stores/appStore";
import type { ProfileStats } from "@/types/database";

const supabase = createClient();

// Debounce refetchFriends to prevent race conditions with optimistic updates
const FRIENDS_REFETCH_DEBOUNCE_MS = 1500;

interface UseRealtimeFriendshipsParams {
  setFriends: (friends: FriendWithFriendshipId[]) => void;
  setRequests: (requests: FriendshipWithRequester[]) => void;
  setSentRequests: (sentRequests: FriendshipWithAddressee[]) => void;
  updateStats: (stats: Partial<ProfileStats>) => void;
  isPreloading: boolean;
}

export function useRealtimeFriendships({
  setFriends,
  setRequests,
  setSentRequests,
  updateStats,
  isPreloading,
}: UseRealtimeFriendshipsParams) {
  const isSetupRef = useRef<boolean>(false);
  const friendsDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const refetchFriends = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        updateStats({ friends_count: data.friends?.length || 0 });
      }

      const reqRes = await fetch("/api/friends/requests");
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.requests || []);
        setSentRequests(reqData.sentRequests || []);
      }
    } catch (error) {
      console.error("Failed to refetch friends:", error);
    }
  }, [setFriends, setRequests, setSentRequests, updateStats]);

  const debouncedRefetchFriends = useCallback(() => {
    if (friendsDebounceRef.current) {
      clearTimeout(friendsDebounceRef.current);
    }
    friendsDebounceRef.current = setTimeout(() => {
      refetchFriends();
    }, FRIENDS_REFETCH_DEBOUNCE_MS);
  }, [refetchFriends]);

  useEffect(() => {
    if (isPreloading) return;
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    let isMounted = true;

    // Channel for friendships - refetch friends on any change (debounced)
    const friendshipsChannel = supabase
      .channel("global-friendships")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        () => {
          if (!isMounted) return;
          // Use debounced refetch to prevent race conditions with optimistic updates
          debouncedRefetchFriends();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      isSetupRef.current = false;
      if (friendsDebounceRef.current) {
        clearTimeout(friendsDebounceRef.current);
      }
      supabase.removeChannel(friendshipsChannel);
    };
  }, [isPreloading, debouncedRefetchFriends]);
}
