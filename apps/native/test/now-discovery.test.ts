import { describe, expect, it } from "vitest";
import { nextDiscoveryRadius, splitNearbyPeople } from "@/lib/now-discovery";

describe("native Now discovery", () => {
  it("expands the supported radius without exceeding 25 km", () => {
    expect(nextDiscoveryRadius(2)).toBe(10);
    expect(nextDiscoveryRadius(10)).toBe(25);
    expect(nextDiscoveryRadius(25)).toBe(25);
  });

  it("shows each eligible nearby person once in the right social section", () => {
    const result = splitNearbyPeople([
      { id: "friend", distanceKm: 1.8, relationship: "friend" },
      { id: "new", distanceKm: 1.9, relationship: "none" },
      { id: "far", distanceKm: 10.1, relationship: "friend" },
    ], 2);

    expect(result.friends.map((person) => person.id)).toEqual(["friend"]);
    expect(result.others.map((person) => person.id)).toEqual(["new"]);
  });

  it("keeps the server's discovery ranking inside each social section", () => {
    const result = splitNearbyPeople([
      { id: "new-mutual-meetup", distanceKm: 1.8, relationship: "none" },
      { id: "friend-connected", distanceKm: 1.2, relationship: "friend" },
      { id: "new-mutual-friends", distanceKm: 0.2, relationship: "none" },
      { id: "friend-intent", distanceKm: 0.1, relationship: "friend" },
    ], 2);

    expect(result.others.map((person) => person.id)).toEqual([
      "new-mutual-meetup",
      "new-mutual-friends",
    ]);
    expect(result.friends.map((person) => person.id)).toEqual([
      "friend-connected",
      "friend-intent",
    ]);
  });
});
