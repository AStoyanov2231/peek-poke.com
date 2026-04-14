"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { haversineKm } from "@/lib/geo";

const MEETING_RADIUS_KM = 0.05; // 50 meters

type MeetingSlice = {
  nearbyUsers: ReturnType<typeof useAppStore.getState>["nearbyUsers"];
  friends: ReturnType<typeof useAppStore.getState>["friends"];
  metFriendIds: ReturnType<typeof useAppStore.getState>["metFriendIds"];
  userLocation: ReturnType<typeof useAppStore.getState>["userLocation"];
};

function selectMeetingSlice(state: ReturnType<typeof useAppStore.getState>): MeetingSlice {
  return {
    nearbyUsers: state.nearbyUsers,
    friends: state.friends,
    metFriendIds: state.metFriendIds,
    userLocation: state.userLocation,
  };
}

export function useMeetingDetection(userId: string | undefined) {
  // Session-level dedup to avoid repeated API calls
  const calledRef = useRef<Set<string>>(new Set());
  const prevSliceRef = useRef<MeetingSlice | null>(null);

  useEffect(() => {
    if (!userId) return;

    const unsub = useAppStore.subscribe((state) => {
      const slice = selectMeetingSlice(state);

      // Only run when relevant state actually changed
      const prev = prevSliceRef.current;
      if (
        prev &&
        prev.nearbyUsers === slice.nearbyUsers &&
        prev.friends === slice.friends &&
        prev.metFriendIds === slice.metFriendIds &&
        prev.userLocation === slice.userLocation
      ) {
        return;
      }
      prevSliceRef.current = slice;

      const { nearbyUsers, friends, metFriendIds, userLocation } = slice;

      if (!userLocation || friends.length === 0 || nearbyUsers.length === 0) return;

      const friendIds = new Set(friends.map((f) => f.id));

      for (const nearby of nearbyUsers) {
        // Must be an accepted friend
        if (!friendIds.has(nearby.userId)) continue;
        // Already met (from DB)
        if (metFriendIds.has(nearby.userId)) continue;
        // Already called this session
        if (calledRef.current.has(nearby.userId)) continue;

        const dist = haversineKm(
          userLocation.lat,
          userLocation.lng,
          nearby.lat,
          nearby.lng
        );

        if (dist <= MEETING_RADIUS_KM) {
          // Mark as called immediately to prevent duplicate calls
          calledRef.current.add(nearby.userId);

          fetch("/api/coins/meeting", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ friend_id: nearby.userId }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.awarded && data.balance !== undefined) {
                useAppStore.getState().setCoins(data.balance);
                useAppStore.getState().addMetFriendId(nearby.userId);
              } else if (data.already_met) {
                useAppStore.getState().addMetFriendId(nearby.userId);
              }
            })
            .catch((err) => {
              console.error("Meeting detection failed:", err);
              // Allow retry on error
              calledRef.current.delete(nearby.userId);
            });
        }
      }
    });

    return unsub;
  }, [userId]);
}
