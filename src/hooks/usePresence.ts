"use client";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading } from "@/stores/selectors";
import type { RealtimeChannel } from "@supabase/supabase-js";

const supabase = createClient();

type PresenceState = {
  user_id: string;
  online_at: string;
};

export function usePresence(userId: string | undefined) {
  const isPreloading = useIsPreloading();
  const setOnlineUsers = useAppStore((state) => state.setOnlineUsers);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSetupRef = useRef<boolean>(false);

  useEffect(() => {
    // Don't set up until preload completes and we have a user
    if (isPreloading || !userId) {
      return;
    }

    // Prevent duplicate setup
    if (isSetupRef.current) {
      return;
    }
    isSetupRef.current = true;

    // Create presence channel
    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    // Handle presence sync - called when presence state changes
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceState>();
      // Extract all online user IDs from presence state
      const onlineIds: string[] = [];
      for (const key of Object.keys(state)) {
        const presences = state[key];
        if (presences && presences.length > 0) {
          onlineIds.push(presences[0].user_id);
        }
      }
      setOnlineUsers(onlineIds);
    });

    // Subscribe and track our presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;

    // Handle visibility changes - untrack when hidden, track when visible
    const handleVisibilityChange = async () => {
      if (!channelRef.current) return;

      try {
        if (document.visibilityState === "hidden") {
          await channelRef.current.untrack();
        } else if (document.visibilityState === "visible") {
          await channelRef.current.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Failed to update presence:", error);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle beforeunload to untrack before closing
    const handleBeforeUnload = () => {
      if (channelRef.current) {
        channelRef.current.untrack();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isSetupRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isPreloading, userId, setOnlineUsers]);
}

// Selector hook for checking if a specific user is online
export function useIsUserOnline(userId: string | undefined): boolean {
  const onlineUsers = useAppStore((state) => state.onlineUsers);
  if (!userId) return false;
  return onlineUsers.has(userId);
}
