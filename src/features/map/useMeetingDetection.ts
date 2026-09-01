"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { meetingResponseCompletesPair } from "@peekpoke/shared";
import {
  useFriends,
  useLocationFreshness,
  useNearbyUsers,
  useUserLocation,
} from "@/stores/selectors";
import {
  meetingPairCompleted,
  observeMeetingAuthOwner,
  recordMeeting,
  unsubscribeMeetingAttempt,
  webQueryKeys,
} from "@/data/web-query";

export function shouldDetectWebMeetings({
  hasFreshLocation,
  hasUser,
  hasLocation,
  friendCount,
  nearbyCount,
}: {
  hasFreshLocation: boolean;
  hasUser: boolean;
  hasLocation: boolean;
  friendCount: number;
  nearbyCount: number;
}) {
  return hasFreshLocation && hasUser && hasLocation && friendCount > 0 && nearbyCount > 0;
}

export function useMeetingDetection(userId: string | undefined) {
  const queryClient = useQueryClient();
  const nearbyUsers = useNearbyUsers();
  const friends = useFriends();
  const userLocation = useUserLocation();
  const locationFresh = useLocationFreshness(userId);
  const metFriendIds = useRef<Set<string>>(new Set());
  const calledRef = useRef<Set<string>>(new Set());
  const activeAccountIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    activeAccountIdRef.current = userId;
    metFriendIds.current.clear();
    calledRef.current.clear();
    return () => {
      if (activeAccountIdRef.current === userId) activeAccountIdRef.current = undefined;
    };
  }, [userId]);

  useEffect(() => {
    observeMeetingAuthOwner(userId ?? null);
  }, [userId]);

  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    if (!shouldDetectWebMeetings({
      hasFreshLocation: locationFresh,
      hasUser: Boolean(userId),
      hasLocation: Boolean(userLocation),
      friendCount: friends.length,
      nearbyCount: nearbyUsers.length,
    }) || !userId || !userLocation) return;
    const friendIds = new Set(friends.map((friend) => friend.id));
    const inFlight = new Set<string>();
    const called = calledRef.current;
    const met = metFriendIds.current;
    const consumerId = `web-background-meeting:${userId}`;
    let current = true;

    for (const nearby of nearbyUsers) {
        // Must be an accepted friend
        if (!friendIds.has(nearby.userId)) continue;
        // Already met (from DB)
        if (met.has(nearby.userId) || meetingPairCompleted(userId, nearby.userId)) {
          met.add(nearby.userId);
          continue;
        }
        // Already called this session
        if (called.has(nearby.userId)) continue;

        if (nearby.meeting_eligible === true) {
          // Mark as called immediately to prevent duplicate calls
          called.add(nearby.userId);
          inFlight.add(nearby.userId);

          recordMeeting(userId, nearby.userId, undefined, (data) => {
            if (current && !data.already_met) {
              queryClient.setQueryData(webQueryKeys.coins, { balance: data.balance });
            }
          }, consumerId)
            .then((data) => {
              if (activeAccountIdRef.current !== userId) return;
              if (meetingResponseCompletesPair(data)) {
                met.add(nearby.userId);
              }
            })
            .catch((err) => {
              if (!current) return;
              if (!(err instanceof Error && err.name === "AbortError")) {
                console.error("Meeting detection failed:", err);
              }
              // Allow retry on error
              called.delete(nearby.userId);
            })
            .finally(() => {
              inFlight.delete(nearby.userId);
            });
        }
      }
    return () => {
      current = false;
      for (const friendId of inFlight) {
        unsubscribeMeetingAttempt(userId, friendId, consumerId);
        called.delete(friendId);
      }
      inFlight.clear();
    };
  }, [
    friends,
    locationFresh,
    nearbyUsers,
    queryClient,
    userId,
    userLocation,
  ]);
}
