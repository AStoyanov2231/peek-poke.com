import { describe, expect, it } from "vitest";
import { filterNearbyUsers } from "@/features/map/filters";

const users = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    username: "ada",
    display_name: "Ada",
    avatar_url: null,
    is_online: true,
    last_seen_at: null,
    lat: 42.7,
    lng: 23.3,
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    username: "grace",
    display_name: "Grace",
    avatar_url: null,
    is_online: false,
    last_seen_at: null,
    lat: 42.71,
    lng: 23.31,
  },
];

describe("web map filters", () => {
  it("combines friend, online, and search filters", () => {
    const friendIds = new Set([users[0].userId]);

    expect(filterNearbyUsers(users, "all", friendIds, "")).toEqual(users);
    expect(filterNearbyUsers(users, "friends", friendIds, "")).toEqual([users[0]]);
    expect(filterNearbyUsers(users, "online", friendIds, "")).toEqual([users[0]]);
    expect(filterNearbyUsers(users, "all", friendIds, "GRACE")).toEqual([users[1]]);
    expect(filterNearbyUsers(users, "all", friendIds, "@fitness")).toEqual(users);
  });
});
