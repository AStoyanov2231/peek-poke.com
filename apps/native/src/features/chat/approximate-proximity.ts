export const APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS = 30_000;

/**
 * Chat can mention a shared approximate area only from a recent successful
 * server response while the viewer's acknowledged location remains fresh.
 */
export function hasCurrentApproximateNearbyResult({
  locationFresh,
  querySucceeded,
  queryErrored,
  dataUpdatedAt,
  now,
}: {
  locationFresh: boolean;
  querySucceeded: boolean;
  queryErrored: boolean;
  dataUpdatedAt: number;
  now: number;
}) {
  return locationFresh
    && querySucceeded
    && !queryErrored
    && dataUpdatedAt > 0
    && now - dataUpdatedAt >= 0
    && now - dataUpdatedAt < APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS;
}

export function shouldShowApproximateChatHint(
  sociallyEligible: boolean,
  peerIsInCurrentNearbyResult: boolean,
) {
  return sociallyEligible && peerIsInCurrentNearbyResult;
}
