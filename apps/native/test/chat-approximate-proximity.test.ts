import { describe, expect, it } from "vitest";
import {
  APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  hasCurrentApproximateNearbyResult,
} from "@/features/chat/approximate-proximity";

describe("native chat approximate-area freshness", () => {
  it("does not keep a cached nearby result after its expiry, a query failure, or location expiry", () => {
    const now = 1_000_000;
    const current = {
      locationFresh: true,
      querySucceeded: true,
      queryErrored: false,
      dataUpdatedAt: now - 1,
      now,
    };

    expect(hasCurrentApproximateNearbyResult(current)).toBe(true);
    expect(hasCurrentApproximateNearbyResult({
      ...current,
      dataUpdatedAt: now - APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
    })).toBe(false);
    expect(hasCurrentApproximateNearbyResult({ ...current, queryErrored: true })).toBe(false);
    expect(hasCurrentApproximateNearbyResult({ ...current, locationFresh: false })).toBe(false);
  });
});
