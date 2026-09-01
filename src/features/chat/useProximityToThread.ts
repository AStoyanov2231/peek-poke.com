"use client";

import { useMemo } from "react";
import {
  useLocationFreshness,
  useFriends,
  useThreads,
  useNearbyUsers,
  useUserLocation,
} from "@/stores/selectors";
import { useAuth } from "@/features/auth/useAuth";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useProximityToThread(threadId: string | null): {
  distanceMeters: number | null;
  isNearby: boolean;
  meetingEligible: boolean;
} {
  const { user } = useAuth();
  const threads = useThreads();
  const friends = useFriends();
  const nearbyUsers = useNearbyUsers();
  const userLocation = useUserLocation();
  const locationFresh = useLocationFreshness(user?.id);

  return useMemo(() => {
    if (!threadId || !user || !locationFresh || !userLocation) {
      return { distanceMeters: null, isNearby: false, meetingEligible: false };
    }

    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return { distanceMeters: null, isNearby: false, meetingEligible: false };

    const otherUserId =
      thread.participant_1_id === user.id ? thread.participant_2_id : thread.participant_1_id;
    const acceptedFriend = friends.some((friend) => friend.id === otherUserId);

    const nearbyUser = nearbyUsers.find((u) => u.userId === otherUserId);
    if (!nearbyUser) return { distanceMeters: null, isNearby: false, meetingEligible: false };

    const d = haversineMeters(userLocation.lat, userLocation.lng, nearbyUser.lat, nearbyUser.lng);
    const distanceMeters = Math.round(d);
    return {
      distanceMeters,
      isNearby: d < 500,
      meetingEligible: acceptedFriend && nearbyUser.meeting_eligible === true,
    };
  }, [threadId, user, threads, friends, nearbyUsers, userLocation, locationFresh]);
}
