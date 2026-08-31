import { describe, expect, it } from "vitest";
import { meetingProximityEligible } from "@peekpoke/shared";
import { shouldDetectWebMeetings } from "@/features/map/useMeetingDetection";

describe("web chat meeting eligibility", () => {
  it("accepts only the bounded proximity window", () => {
    expect(meetingProximityEligible(null)).toBe(false);
    expect(meetingProximityEligible(-1)).toBe(false);
    expect(meetingProximityEligible(130)).toBe(true);
    expect(meetingProximityEligible(131)).toBe(false);
  });

  it("requires fresh location, an authenticated user, friends, and nearby users", () => {
    const ready = {
      hasFreshLocation: true,
      hasUser: true,
      hasLocation: true,
      friendCount: 1,
      nearbyCount: 1,
    };

    expect(shouldDetectWebMeetings(ready)).toBe(true);
    expect(shouldDetectWebMeetings({ ...ready, hasFreshLocation: false })).toBe(false);
    expect(shouldDetectWebMeetings({ ...ready, friendCount: 0 })).toBe(false);
    expect(shouldDetectWebMeetings({ ...ready, nearbyCount: 0 })).toBe(false);
  });
});
