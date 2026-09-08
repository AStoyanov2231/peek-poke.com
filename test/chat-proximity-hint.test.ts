import { describe, expect, it } from "vitest";
import {
  APPROXIMATE_CHAT_NEARBY_MAX_AGE_MS,
  hasCurrentApproximateNearbyResult,
} from "@/features/chat/approximate-proximity";

describe("web chat approximate-area hint", () => {
  it("expires a successful nearby response and denies failed or stale location state", () => {
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
    expect(hasCurrentApproximateNearbyResult({ ...current, locationFresh: false })).toBe(false);
    expect(hasCurrentApproximateNearbyResult({ ...current, queryErrored: true })).toBe(false);
  });
});
