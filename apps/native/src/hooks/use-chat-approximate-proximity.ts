import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { meetingEligiblePeerIds } from "@peekpoke/shared";
import { fetchPokes } from "@/data/pokes";
import { nearbyQueryOptions } from "@/data/discovery/queries";
import { locationIsFreshForDiscovery } from "@/data/discovery/location-sync";
import { socialQuery } from "@/data/social/queries";
import { useDeviceLocation } from "@/lib/location";
import {
  APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  hasCurrentApproximateNearbyResult,
  shouldShowApproximateChatHint,
} from "@/features/chat/approximate-proximity";

export function useChatApproximateProximity(
  accountId: string | undefined,
  peerId: string | undefined,
) {
  const deviceLocation = useDeviceLocation();
  const locationFresh = locationIsFreshForDiscovery(deviceLocation, accountId);
  const socialDataQuery = useQuery(socialQuery());
  const pokesQuery = useQuery({
    queryKey: ["chat", "approximate-proximity", "pokes", accountId],
    queryFn: ({ signal }) => fetchPokes(signal),
    enabled: Boolean(accountId),
  });
  const eligiblePeerIds = useMemo(() => {
    if (!accountId) return new Set<string>();
    const friends = socialDataQuery.data?.friends ?? [];
    const friendPeerIds = friends.flatMap((friend) => {
      const peer = friend.requester_id === accountId ? friend.addressee_id : friend.requester_id;
      return peer ? [peer] : [];
    });
    return meetingEligiblePeerIds(
      accountId,
      friendPeerIds,
      [...(pokesQuery.data?.received ?? []), ...(pokesQuery.data?.sent ?? [])],
    );
  }, [accountId, socialDataQuery.data?.friends, pokesQuery.data]);
  const sociallyEligible = Boolean(peerId && eligiblePeerIds.has(peerId));
  const nearbyQuery = useQuery({
    ...nearbyQueryOptions(deviceLocation.coords ?? { lat: 0, lng: 0 }, accountId ?? ""),
    // Fetch the viewer's current server-authorized result independently of a
    // relationship query that may resolve later. Rendering still requires the
    // accepted relationship and the peer to be present in this DTO.
    enabled: Boolean(accountId && peerId && deviceLocation.coords && locationFresh),
    staleTime: APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
    refetchInterval: APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!locationFresh || !nearbyQuery.dataUpdatedAt) return;

    const currentClockTimer = setTimeout(() => setNow(Date.now()), 0);
    const remainingMs = nearbyQuery.dataUpdatedAt + APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS - Date.now();
    if (remainingMs <= 0) {
      return () => clearTimeout(currentClockTimer);
    }

    const expiryTimer = setTimeout(() => setNow(Date.now()), remainingMs);
    return () => {
      clearTimeout(currentClockTimer);
      clearTimeout(expiryTimer);
    };
  }, [locationFresh, nearbyQuery.dataUpdatedAt]);

  const nearbyResultIsCurrent = hasCurrentApproximateNearbyResult({
    locationFresh,
    querySucceeded: Boolean(nearbyQuery.data),
    queryErrored: nearbyQuery.isError,
    dataUpdatedAt: nearbyQuery.dataUpdatedAt,
    now,
  });
  const peerIsInCurrentNearbyResult = Boolean(
    nearbyResultIsCurrent
      && peerId
      && nearbyQuery.data?.some((nearby) => nearby.userId === peerId),
  );

  return shouldShowApproximateChatHint(sociallyEligible, peerIsInCurrentNearbyResult);
}
