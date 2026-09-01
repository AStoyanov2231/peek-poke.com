import { describe, expect, it } from "vitest";
import type { NearbyUser } from "@peekpoke/shared";
import { meetingCandidateIds, shouldDetectMeetings } from "@/data/discovery/meeting";

const nearby: NearbyUser[] = [
  {
    userId: "friend-close",
    username: "close",
    display_name: "Close",
    avatar_url: null,
    is_online: true,
    last_seen_at: "2026-08-07T12:00:00.000Z",
    lat: 42.6978,
    lng: 23.3219,
    meeting_eligible: true,
  },
  {
    userId: "friend-far",
    username: "far",
    display_name: "Far",
    avatar_url: null,
    is_online: false,
    last_seen_at: null,
    lat: 42.7,
    lng: 23.3219,
    meeting_eligible: false,
  },
];

describe("meeting candidates", () => {
  it("suppresses meeting detection while retained coordinates are stale", () => {
    expect(shouldDetectMeetings({
      active: true,
      hasFreshLocation: false,
      hasProfile: true,
      friendCount: 1,
      nearbyCount: 1,
    })).toBe(false);
  });

  it("uses server-provided meeting eligibility", () => {
    expect(meetingCandidateIds(
      nearby,
      new Set(["friend-close", "friend-far"]),
      new Set(),
      new Set(),
    )).toEqual(["friend-close"]);
  });

  it("excludes already-met and currently attempted friends", () => {
    expect(meetingCandidateIds(
      nearby,
      new Set(["friend-close"]),
      new Set(["friend-close"]),
      new Set(),
    )).toEqual([]);
    expect(meetingCandidateIds(
      nearby,
      new Set(["friend-close"]),
      new Set(),
      new Set(["friend-close"]),
    )).toEqual([]);
  });
});
