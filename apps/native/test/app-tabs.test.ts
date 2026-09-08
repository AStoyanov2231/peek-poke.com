import { describe, expect, it } from "vitest";
import { appTabIsActive, inboxBadgeCount } from "@/navigation/app-tabs";

describe("native app tab state", () => {
  it("shows a pending received Poke in the Inbox badge with existing unread counts", () => {
    expect(inboxBadgeCount({
      friendRequests: 2,
      unread: 3,
      pendingReceivedPokes: 1,
    })).toBe(6);
  });

  it("keeps a parent tab selected on premium and Plan routes", () => {
    expect(appTabIsActive("/profile", "/premium")).toBe(true);
    expect(appTabIsActive("/inbox", "/plans/11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(appTabIsActive("/map", "/premium")).toBe(false);
  });
});
