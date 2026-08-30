import { describe, expect, it } from "vitest";
import { resolveNotificationRoute } from "@/lib/navigation-policy";

describe("push notification navigation policy", () => {
  it("allows only supported static and entity routes", () => {
    expect(resolveNotificationRoute("/")).toBe("/");
    expect(resolveNotificationRoute("/map")).toBe("/map");
    expect(resolveNotificationRoute("/inbox")).toBe("/inbox");
    expect(resolveNotificationRoute("/chat/4de036ee-bf15-47d7-b3f7-fdd723038b8b"))
      .toBe("/chat/4de036ee-bf15-47d7-b3f7-fdd723038b8b");
    expect(resolveNotificationRoute("/profile/user_123")).toBe("/profile/user_123");
    expect(resolveNotificationRoute("/premium")).toBe("/premium");
    expect(resolveNotificationRoute("/admin")).toBe("/admin");
  });

  it("accepts only the known inbox tab query", () => {
    expect(resolveNotificationRoute("/inbox?tab=friends")).toBe("/inbox?tab=friends");
    expect(resolveNotificationRoute("/inbox?tab=requests")).toBe("/inbox?tab=requests");
    expect(resolveNotificationRoute("/inbox?tab=unknown")).toBeNull();
    expect(resolveNotificationRoute("/inbox?tab=friends&next=/admin")).toBeNull();
    expect(resolveNotificationRoute("/chat/thread-1?tab=friends")).toBeNull();
  });

  it("rejects external, malformed, and traversal routes", () => {
    const rejected = [
      "https://example.com/inbox",
      "peekpoke://inbox",
      "//example.com/inbox",
      "/chat/../admin",
      "/chat/%2e%2e/admin",
      "/chat%2Fthread-1",
      "/auth/reset-password",
      "/invite/token",
      "/unknown",
      "/chat/",
      { route: "/inbox" },
      null,
    ];

    for (const route of rejected) {
      expect(resolveNotificationRoute(route)).toBeNull();
    }
  });
});
