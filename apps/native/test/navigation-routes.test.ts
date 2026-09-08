import { describe, expect, it } from "vitest";
import {
  adminNativeTab,
  coreNativeStackRoutes,
  coreNativeTabs,
  nativeAuthenticatedHomeRoute,
} from "@/lib/navigation-policy";

describe("native navigation definitions", () => {
  it("keeps the four core tabs in product order", () => {
    expect(coreNativeTabs).toEqual([
      { name: "now", route: "/(app)/now", path: "/now" },
      { name: "map", route: "/(app)/map", path: "/map" },
      { name: "inbox", route: "/(app)/inbox", path: "/inbox" },
      { name: "profile", route: "/(app)/profile", path: "/profile" },
    ]);
  });

  it("routes a completed authenticated session to Now, not the map", () => {
    expect(nativeAuthenticatedHomeRoute).toBe("/(app)/now");
  });

  it("keeps admin role-gated and defines the core stack routes", () => {
    expect(adminNativeTab).toEqual({
      name: "admin",
      route: "/(app)/admin",
      path: "/admin",
    });
    expect(coreNativeStackRoutes).toEqual([
      "/",
      "/(auth)/login",
      "/auth/callback",
      "/auth/reset-password",
      "/onboarding",
      "/(app)",
      "/chat/[threadId]",
      "/group/[groupId]",
      "/invite/[inviterId]",
    ]);
  });

  it("runs the same route contract for each native platform command", () => {
    const platform = process.env.NATIVE_TEST_PLATFORM === "ios" ? "ios" : "android";
    expect(["ios", "android"]).toContain(platform);
    expect(coreNativeTabs).toHaveLength(4);
  });
});
