import { describe, expect, it } from "vitest";
import type { Plan } from "@peekpoke/shared";
import { upcomingPlansForNow } from "@/lib/now-plans";

const now = Date.parse("2026-09-08T12:00:00.000Z");

function plan(id: string, overrides: Partial<Plan> = {}): Plan {
  return {
    id,
    owner_id: "11111111-1111-4111-8111-111111111111",
    activity: "coffee",
    title: null,
    starts_at: "2026-09-08T13:00:00.000Z",
    place_text: "Park café",
    visibility: "open",
    circle_id: null,
    participant_limit: 4,
    member_count: 1,
    status: "active",
    created_at: "2026-09-08T10:00:00.000Z",
    updated_at: "2026-09-08T10:00:00.000Z",
    viewer_is_member: false,
    viewer_is_owner: false,
    source_thread_id: null,
    ...overrides,
  };
}

describe("native Now Plans", () => {
  it("keeps server-authorized member Plans alongside nearby open Plans", () => {
    const result = upcomingPlansForNow([
      plan("nearby-open"),
      plan("member-private", { visibility: "private", viewer_is_member: true }),
    ], now);

    expect(result.map((item) => item.id)).toEqual(["nearby-open", "member-private"]);
  });

  it("does not present cancelled or already-started Plans as upcoming", () => {
    const result = upcomingPlansForNow([
      plan("cancelled", { status: "cancelled" }),
      plan("started", { starts_at: "2026-09-08T11:59:59.000Z", viewer_is_member: true }),
      plan("future"),
    ], now);

    expect(result.map((item) => item.id)).toEqual(["future"]);
  });
});
