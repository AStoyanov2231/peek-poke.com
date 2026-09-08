import { describe, expect, it } from "vitest";
import { conciseDiscoveryReasonLabels } from "@/features/now/discovery-reasons";
import { activePeopleWithinRadius } from "@/features/now/discovery-order";

const person = (id: string, distanceKm: number, expiresAt = "2026-09-08T12:00:00.000Z") => ({
  profile: { id, username: id, display_name: id, avatar_url: null, location_text: null, is_online: false, last_seen_at: null },
  availability: { id: `${id}-availability`, userId: id, activity: "coffee" as const, customLabel: null, expiresAt, createdAt: "2026-09-08T10:00:00.000Z", updatedAt: "2026-09-08T10:00:00.000Z" },
  distanceKm,
  relationship: "none" as const,
  sharedInterestNames: [],
});

describe("web discovery context labels", () => {
  it("shows at most two non-duplicative, privacy-safe reasons in server order", () => {
    expect(conciseDiscoveryReasonLabels([
      "shared_interests",
      "mutual_friends",
      "connected_before",
      "mutual_meetup",
    ])).toEqual(["Friends in common", "Connected before"]);
  });

  it("accepts a legacy response without discovery reasons", () => {
    expect(conciseDiscoveryReasonLabels(undefined)).toEqual([]);
  });

  it("filters without replacing the server's affinity ranking", () => {
    const people = [
      person("mutual-meetup", 1.8),
      person("connected-before", 0.2),
      person("outside-radius", 4),
      person("expired", 1, "2026-09-08T09:59:00.000Z"),
    ];

    expect(activePeopleWithinRadius(people, 2, Date.parse("2026-09-08T10:00:00.000Z"))
      .map((entry) => entry.profile.id)).toEqual(["mutual-meetup", "connected-before"]);
  });
});
