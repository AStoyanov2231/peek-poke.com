import { describe, expect, it } from "vitest";
import type { NearbyUser } from "@peekpoke/shared";
import {
  filterNearbyUsers,
  mapFilterControlAccessibility,
  mapFilterOptionAccessibility,
  mapFilterOptionMinHeight,
  nearbyCardIsOnline,
  visibleSelectedClusterUsers,
  visibleHighlightedUser,
} from "@/features/map/filters";

const nearbyUsers = [
  { userId: "ada", display_name: "Ada Lovelace", username: "ada", is_online: true },
  { userId: "grace", display_name: "Grace Hopper", username: "grace", is_online: false },
  { userId: "lin", display_name: "Lin Chen", username: "lin", is_online: true },
] as NearbyUser[];

describe("native map filters", () => {
  it("matches web All, Friends, and Online semantics before applying text search", () => {
    const friendIds = new Set(["grace", "lin"]);

    expect(filterNearbyUsers(nearbyUsers, "all", friendIds, "").map((user) => user.userId)).toEqual(["ada", "grace", "lin"]);
    expect(filterNearbyUsers(nearbyUsers, "friends", friendIds, "").map((user) => user.userId)).toEqual(["grace", "lin"]);
    expect(filterNearbyUsers(nearbyUsers, "online", friendIds, "").map((user) => user.userId)).toEqual(["ada", "lin"]);
  });

  it("combines the selected filter with normalized display-name and username search", () => {
    const friendIds = new Set(["grace", "lin"]);

    expect(filterNearbyUsers(nearbyUsers, "friends", friendIds, "  GRACE ").map((user) => user.userId)).toEqual(["grace"]);
    expect(filterNearbyUsers(nearbyUsers, "online", friendIds, "lin").map((user) => user.userId)).toEqual(["lin"]);
    expect(filterNearbyUsers(nearbyUsers, "online", friendIds, "grace")).toEqual([]);
  });

  it("derives nearby-card Online state from the same field used by the Online filter", () => {
    const onlineUsers = filterNearbyUsers(nearbyUsers, "online", new Set(), "");

    expect(onlineUsers).toHaveLength(2);
    expect(onlineUsers.every(nearbyCardIsOnline)).toBe(true);
    expect(nearbyCardIsOnline(nearbyUsers[1])).toBe(false);
  });

  it("keeps a highlighted user visible only when the active filter and search include them", () => {
    const onlineUsers = filterNearbyUsers(nearbyUsers, "online", new Set(["grace"]), "");
    const textMatchedUsers = filterNearbyUsers(nearbyUsers, "all", new Set(["grace"]), "lin");

    expect(visibleHighlightedUser(onlineUsers, "grace")).toBeNull();
    expect(visibleHighlightedUser(textMatchedUsers, "grace")).toBeNull();
    expect(visibleHighlightedUser(onlineUsers, "ada")?.userId).toBe("ada");
  });

  it("does not let a stale selected cluster reintroduce users excluded by updated membership or online state", () => {
    const selectedClusterUserIds = ["grace", "lin"];
    const refreshedUsers = nearbyUsers.map((user) =>
      user.userId === "lin" ? { ...user, is_online: false } : user,
    );
    const onlineUsers = filterNearbyUsers(refreshedUsers, "online", new Set(["grace"]), "");
    const friendsAfterMembershipChange = filterNearbyUsers(refreshedUsers, "friends", new Set(["grace"]), "");

    expect(visibleSelectedClusterUsers(onlineUsers, selectedClusterUserIds).map((user) => user.userId)).toEqual([]);
    expect(visibleSelectedClusterUsers(friendsAfterMembershipChange, selectedClusterUserIds).map((user) => user.userId)).toEqual(["grace"]);
    expect(visibleSelectedClusterUsers(onlineUsers, null).map((user) => user.userId)).toEqual(["ada"]);
  });

  it("exposes selected state and platform-sized filter interactions", () => {
    expect(mapFilterControlAccessibility("friends", true)).toEqual({
      label: "Filter nearby people: Friends",
      hint: "Choose All, Friends, or Online people to show on the map",
      state: { expanded: true },
    });
    expect(mapFilterOptionAccessibility("online", true)).toEqual({
      label: "Online",
      role: "button",
      state: { selected: true },
    });
    expect(mapFilterOptionMinHeight("ios")).toBe(44);
    expect(mapFilterOptionMinHeight("android")).toBe(48);
  });
});
