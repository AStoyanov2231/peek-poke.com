import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  meetingResponseCompletesPair,
  type NearbyUser,
} from "@peekpoke/shared";
import { useDiscoveryActivity } from "@/data/discovery/lifecycle";
import { meetingCandidateIds, shouldDetectMeetings } from "@/data/discovery/meeting";
import {
  createLocationSyncCoordinator,
  locationIsFreshForDiscovery,
  runLocationSyncAttempt,
} from "@/data/discovery/location-sync";
import { nearbyQueryOptions } from "@/data/discovery/queries";
import {
  fetchCoins,
  fetchCurrentProfile,
  meetingPairCompleted,
  recordMeeting,
  unsubscribeMeetingAttempt,
} from "@/data/api";
import { updateLocation } from "@/data/discovery/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { socialQuery } from "@/data/social/queries";
import {
  markDeviceLocationStale,
  markDeviceLocationSynced,
  refreshDeviceLocation,
  useDeviceLocation,
} from "@/lib/location";

const EMPTY_NEARBY_USERS: NearbyUser[] = [];

/**
 * Mirrors the web meeting detector. The API independently verifies accepted
 * friendship, fresh server-side locations, and the 50 m radius before it can
 * record a meeting or award a coin.
 */
export function useMeetingDetection() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const socialDataQuery = useQuery(socialQuery());
  useQuery({
    queryKey: nativeQueryKeys.coins,
    queryFn: fetchCoins,
  });
  const profileId = profileQuery.data?.id;
  const friends = useMemo(
    () => socialDataQuery.data?.friends ?? [],
    [socialDataQuery.data?.friends],
  );
  const activity = useDiscoveryActivity();
  const deviceLocation = useDeviceLocation();
  const { coords: location } = deviceLocation;
  const locationFresh = locationIsFreshForDiscovery(deviceLocation, profileId);
  const active = activity.appState === "active" && !!profileId;
  const ownsLocation = active && !activity.focused;
  const [locationSyncCoordinator] = useState(createLocationSyncCoordinator);
  const nearbyQuery = useQuery({
    ...nearbyQueryOptions(location ?? { lat: 0, lng: 0 }, profileId ?? ""),
    enabled: active && locationFresh,
  });
  const nearbyUsers = locationFresh
    ? (nearbyQuery.data ?? EMPTY_NEARBY_USERS)
    : EMPTY_NEARBY_USERS;
  const attemptedRef = useRef(new Set<string>());
  const metFriendIdsRef = useRef(new Set<string>());
  const requestsRef = useRef(new Set<string>());
  const activeProfileIdRef = useRef<string | undefined>(profileId);

  useEffect(() => {
    if (!ownsLocation || !profileId || locationFresh) return;
    let current = true;
    void runLocationSyncAttempt({
      coordinator: locationSyncCoordinator,
      userId: profileId,
      resolveCoordinates: refreshDeviceLocation,
      sync: updateLocation,
      onFailure: (error) => {
        if (!current) return;
        markDeviceLocationStale(
          profileId,
          error instanceof Error ? error.message : "Could not refresh your location",
        );
      },
      onPending: () => undefined,
      onSuccess: (coords) => {
        if (current) markDeviceLocationSynced(profileId, coords);
      },
    });
    return () => {
      current = false;
      locationSyncCoordinator.cancel();
    };
  }, [locationFresh, locationSyncCoordinator, ownsLocation, profileId]);

  useEffect(() => {
    activeProfileIdRef.current = profileId;
    attemptedRef.current.clear();
    metFriendIdsRef.current.clear();
    requestsRef.current.clear();
    return () => {
      if (activeProfileIdRef.current === profileId) activeProfileIdRef.current = undefined;
    };
  }, [profileId]);

  useEffect(() => {
    const attempted = attemptedRef.current;
    const requests = requestsRef.current;
    if (!shouldDetectMeetings({
      active,
      hasFreshLocation: locationFresh,
      hasProfile: Boolean(profileId),
      friendCount: friends.length,
      nearbyCount: nearbyUsers.length,
    }) || !profileId || !location) {
      for (const friendId of requests) {
        attempted.delete(friendId);
      }
      requests.clear();
      return;
    }
    let current = true;
    const consumerId = `native-background-meeting:${profileId}`;

    const friendIds = new Set(friends.flatMap((friend) => {
      const peerId = friend.requester_id === profileId ? friend.addressee_id : friend.requester_id;
      return peerId ? [peerId] : [];
    }));
    const completedFriendIds = new Set(metFriendIdsRef.current);
    for (const friendId of friendIds) {
      if (meetingPairCompleted(profileId, friendId)) completedFriendIds.add(friendId);
    }
    const candidateIds = meetingCandidateIds(
      location,
      nearbyUsers,
      friendIds,
      completedFriendIds,
      attempted,
    );

    for (const friendId of candidateIds) {
      attempted.add(friendId);
      requests.add(friendId);
      void recordMeeting(profileId, friendId, undefined, (result) => {
          if (current && !result.already_met) {
            queryClient.setQueryData(nativeQueryKeys.coins, { balance: result.balance });
          }
        }, consumerId)
        .then((result) => {
          if (activeProfileIdRef.current !== profileId) return;
          if (meetingResponseCompletesPair(result)) metFriendIdsRef.current.add(friendId);
        })
        .catch(() => {
          if (current) attempted.delete(friendId);
        })
        .finally(() => {
          requests.delete(friendId);
        });
    }

    return () => {
      current = false;
      for (const friendId of requests) {
        unsubscribeMeetingAttempt(profileId, friendId, consumerId);
        attempted.delete(friendId);
      }
      requests.clear();
    };
  }, [active, friends, location, locationFresh, nearbyUsers, profileId, queryClient]);
}
