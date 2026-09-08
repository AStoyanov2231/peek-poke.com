export const APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS = 30_000;

/**
 * The nearby endpoint is the sole source of a chat presence signal.
 * A cached result, a failed refresh, or an expired local location is never
 * enough to say that two people share an area.
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
