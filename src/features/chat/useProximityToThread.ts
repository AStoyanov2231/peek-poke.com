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
import { meetingEligiblePeerIds, meetingProximityEligible } from "@peekpoke/shared";
import { plansQueryOptions, pokesQueryOptions } from "@/data/web-query";
import { useQuery } from "@tanstack/react-query";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useProximityToThread(threadId: string | null, openedPeerId?: string): {
  distanceMeters: number | null;
  isNearby: boolean;
  meetingEligible: boolean;
  sociallyEligible: boolean;
} {
  const { user } = useAuth();
  const threads = useThreads();
  const friends = useFriends();
  const nearbyUsers = useNearbyUsers();
  const userLocation = useUserLocation();
  const locationFresh = useLocationFreshness(user?.id);
  const pokesQuery = useQuery(pokesQueryOptions);
  const plansQuery = useQuery(plansQueryOptions);

  return useMemo(() => {
    if (!threadId || !user) {
      return { distanceMeters: null, isNearby: false, meetingEligible: false, sociallyEligible: false };
    }

    const thread = threads.find((t) => t.id === threadId);
    // The opened conversation is authoritative even while the paginated Inbox
    // is stale after Poke acceptance or does not include this older thread.
    const otherUserId = openedPeerId ?? (thread
      ? thread.participant_1_id === user.id ? thread.participant_2_id : thread.participant_1_id
      : null);
    if (!otherUserId) return { distanceMeters: null, isNearby: false, meetingEligible: false, sociallyEligible: false };
    const eligiblePeerIds = meetingEligiblePeerIds(
      user.id,
      friends.map((friend) => friend.id),
      [...(pokesQuery.data?.received ?? []), ...(pokesQuery.data?.sent ?? [])],
    );
    const hasCurrentPlanForThread = plansQuery.data?.plans.some((plan) =>
      plan.source_thread_id === threadId
      && plan.status === "active"
    ) ?? false;
    const sociallyEligible = eligiblePeerIds.has(otherUserId) || hasCurrentPlanForThread;

    if (!locationFresh || !userLocation) {
      return { distanceMeters: null, isNearby: false, meetingEligible: false, sociallyEligible };
    }

    const nearbyUser = nearbyUsers.find((u) => u.userId === otherUserId);
    if (!nearbyUser) return { distanceMeters: null, isNearby: false, meetingEligible: false, sociallyEligible };

    const d = haversineMeters(userLocation.lat, userLocation.lng, nearbyUser.lat, nearbyUser.lng);
    const distanceMeters = Math.round(d);
    return {
      distanceMeters,
      isNearby: d < 500,
      meetingEligible: sociallyEligible && meetingProximityEligible(distanceMeters),
      sociallyEligible,
    };
  }, [threadId, openedPeerId, user, threads, friends, nearbyUsers, userLocation, locationFresh, pokesQuery.data, plansQuery.data]);
}
