import { describe, expect, it } from "vitest";
import type { Plan } from "@peekpoke/shared/plans";
import { splitPlanFeed } from "@/data/plan-feed";

const now = new Date("2027-01-15T12:00:00.000Z").getTime();

function plan(id: string, startsAt: string, viewerIsMember = true): Plan {
  return {
    id,
    owner_id: "11111111-1111-4111-8111-111111111111",
    activity: "Coffee",
    title: null,
    starts_at: startsAt,
    place_text: "Sofia",
    visibility: "friends",
    circle_id: null,
    participant_limit: 4,
    member_count: 2,
    status: "active",
    created_at: "2027-01-01T12:00:00.000Z",
    updated_at: "2027-01-01T12:00:00.000Z",
    viewer_is_member: viewerIsMember,
    viewer_is_owner: false,
    source_thread_id: null,
  };
}

describe("Plan inbox feed", () => {
  it("keeps future Plans separate from only a member's last 48 hours", () => {
    const result = splitPlanFeed(
      [
        plan("future", "2027-01-16T12:00:00.000Z"),
        plan("recent", "2027-01-14T13:00:00.000Z"),
        plan("old", "2027-01-13T11:59:59.000Z"),
        plan("not-a-member", "2027-01-14T13:00:00.000Z", false),
      ],
      now,
    );

    expect(result.upcoming.map((item) => item.id)).toEqual(["future"]);
    expect(result.recent.map((item) => item.id)).toEqual(["recent"]);
  });
});
