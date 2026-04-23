"use client";

import { useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import { useNearbyUsers, useUserLocation } from "@/stores/selectors";
import { useAuth } from "@/hooks/useAuth";

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
} {
  const { user } = useAuth();
  const threads = useAppStore((s) => s.threads);
  const nearbyUsers = useNearbyUsers();
  const userLocation = useUserLocation();

  return useMemo(() => {
    if (!threadId || !user || !userLocation) return { distanceMeters: null, isNearby: false };

    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return { distanceMeters: null, isNearby: false };

    const otherUserId =
      thread.participant_1_id === user.id ? thread.participant_2_id : thread.participant_1_id;

    const nearbyUser = nearbyUsers.find((u) => u.userId === otherUserId);
    if (!nearbyUser) return { distanceMeters: null, isNearby: false };

    const d = haversineMeters(userLocation.lat, userLocation.lng, nearbyUser.lat, nearbyUser.lng);
    return { distanceMeters: Math.round(d), isNearby: d < 500 };
  }, [threadId, user, threads, nearbyUsers, userLocation]);
}
