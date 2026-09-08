"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useLocationFreshness,
  useFriends,
  useThreads,
  useUserLocation,
} from "@/stores/selectors";
import { useAuth } from "@/features/auth/useAuth";
import { meetingEligiblePeerIds } from "@peekpoke/shared";
import {
  nearbyQueryOptions,
  plansQueryOptions,
  pokesQueryOptions,
} from "@/data/web-query";
import { useQuery } from "@tanstack/react-query";
import {
  APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  hasCurrentApproximateNearbyResult,
  shouldShowApproximateChatHint,
} from "@/features/chat/approximate-proximity";

export function useProximityToThread(threadId: string | null, openedPeerId?: string): {
  isNearby: boolean;
  sociallyEligible: boolean;
} {
  const { user } = useAuth();
  const threads = useThreads();
  const friends = useFriends();
  const userLocation = useUserLocation();
  const locationFresh = useLocationFreshness(user?.id);
  const pokesQuery = useQuery(pokesQueryOptions);
  const plansQuery = useQuery(plansQueryOptions);
  const nearbyQuery = useQuery({
    ...nearbyQueryOptions(userLocation, user?.id),
    enabled: Boolean(locationFresh && userLocation && user?.id),
    refetchInterval: APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!locationFresh || !nearbyQuery.dataUpdatedAt) return;

    // Let the query's success render commit before advancing the clock. This
    // also gives a cached result a current timestamp when chat mounts.
    const currentClockTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const remainingMs = nearbyQuery.dataUpdatedAt + APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS - Date.now();
    if (remainingMs <= 0) {
      return () => window.clearTimeout(currentClockTimer);
    }

    const expiryTimer = window.setTimeout(() => setNow(Date.now()), remainingMs);
    return () => {
      window.clearTimeout(currentClockTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [locationFresh, nearbyQuery.dataUpdatedAt]);

  const nearbyResultIsCurrent = hasCurrentApproximateNearbyResult({
    locationFresh,
    querySucceeded: Boolean(nearbyQuery.data),
    queryErrored: nearbyQuery.isError,
    dataUpdatedAt: nearbyQuery.dataUpdatedAt,
    now,
  });

  return useMemo(() => {
    if (!threadId || !user) {
      return { isNearby: false, sociallyEligible: false };
    }

    const thread = threads.find((t) => t.id === threadId);
    // The opened conversation is authoritative even while the paginated Inbox
    // is stale after Poke acceptance or does not include this older thread.
    const otherUserId = openedPeerId ?? (thread
      ? thread.participant_1_id === user.id ? thread.participant_2_id : thread.participant_1_id
      : null);
    if (!otherUserId) return { isNearby: false, sociallyEligible: false };
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
      return { isNearby: false, sociallyEligible };
    }

    const nearbyUser = nearbyResultIsCurrent
      ? nearbyQuery.data?.find((u) => u.userId === otherUserId)
      : null;
    if (!nearbyUser) return { isNearby: false, sociallyEligible };

    return {
      // The nearby response is already a fresh, server-authorized coarse
      // discovery result. Do not turn an availability record or a client
      // radius guess into an in-chat presence claim.
      isNearby: shouldShowApproximateChatHint(sociallyEligible, true),
      sociallyEligible,
    };
  }, [
    threadId,
    openedPeerId,
    user,
    threads,
    friends,
    userLocation,
    locationFresh,
    nearbyQuery.data,
    nearbyResultIsCurrent,
    pokesQuery.data,
    plansQuery.data,
  ]);
}
