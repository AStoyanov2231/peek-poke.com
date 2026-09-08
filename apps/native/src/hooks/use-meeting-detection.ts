import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  meetingEligiblePeerIds,
  meetingResponseCompletesPair,
  type NearbyUser,
} from "@peekpoke/shared";
import { useDiscoveryActivity } from "@/data/discovery/lifecycle";
import { meetingCandidateIds, shouldDetectMeetings } from "@/data/discovery/meeting";
import { locationIsFreshForDiscovery } from "@/data/discovery/location-sync";
import { shouldRunDiscovery } from "@/data/discovery/policy";
import { nearbyQueryOptions } from "@/data/discovery/queries";
import {
  fetchCoins,
  fetchCurrentProfile,
  meetingPairCompleted,
  recordMeeting,
  unsubscribeMeetingAttempt,
} from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { socialQuery } from "@/data/social/queries";
import { fetchPokes } from "@/data/pokes";
import { useDeviceLocation } from "@/lib/location";

const EMPTY_NEARBY_USERS: NearbyUser[] = [];

/**
 * Retains candidate selection for a future attested reward flow.
 * The capability gate prevents claims from coarse discovery positions until the
 * server supports a verified device-location attestation.
 */
export function useMeetingDetection() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const socialDataQuery = useQuery(socialQuery());
  const pokesQuery = useQuery({
    queryKey: nativeQueryKeys.pokes,
    queryFn: ({ signal }) => fetchPokes(signal),
    enabled: Boolean(profileQuery.data?.id),
  });
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
  const active = shouldRunDiscovery(activity.focused, activity.appState, !!profileId);
  const nearbyQuery = useQuery({
    ...nearbyQueryOptions(location ?? { lat: 0, lng: 0 }, profileId ?? ""),
    enabled: false,
  });
  const nearbyUsers = locationFresh
    ? (nearbyQuery.data ?? EMPTY_NEARBY_USERS)
    : EMPTY_NEARBY_USERS;
  const attemptedRef = useRef(new Set<string>());
  const metFriendIdsRef = useRef(new Set<string>());
  const requestsRef = useRef(new Set<string>());
  const activeProfileIdRef = useRef<string | undefined>(profileId);

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
      friendCount: friends.length + (pokesQuery.data?.received.length ?? 0) + (pokesQuery.data?.sent.length ?? 0),
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
    const eligiblePeerIds = meetingEligiblePeerIds(
      profileId,
      friendIds,
      [...(pokesQuery.data?.received ?? []), ...(pokesQuery.data?.sent ?? [])],
    );
    const completedFriendIds = new Set(metFriendIdsRef.current);
    for (const friendId of eligiblePeerIds) {
      if (meetingPairCompleted(profileId, friendId)) completedFriendIds.add(friendId);
    }
    const candidateIds = meetingCandidateIds(
      location,
      nearbyUsers,
      eligiblePeerIds,
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
  }, [active, friends, location, locationFresh, nearbyUsers, pokesQuery.data, profileId, queryClient]);
}
