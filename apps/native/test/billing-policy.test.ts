import { describe, expect, it } from "vitest";
import {
  mergeAuthoritativeRoles,
  performWebBillingAction,
  resolveWebBillingPolicy,
  type WebBillingPolicyConfig,
} from "@/lib/billing-policy";
import { currentNativePlatform } from "@/lib/platform";

const baseConfig: WebBillingPolicyConfig = {
  platformModes: { ios: "allowed", android: "allowed" },
  region: "BG",
  storefront: "BGR",
  allowedRegions: ["BG"],
  allowedStorefronts: ["BGR"],
  billingUrl: "https://www.peek-poke.com/premium",
};

describe("native web billing policy", () => {
  it("allows only the configured platform branch", () => {
    const platform = currentNativePlatform();
    const other = platform === "ios" ? "android" : "ios";
    const decision = resolveWebBillingPolicy(platform, {
      ...baseConfig,
      platformModes: { ios: "denied", android: "denied", [platform]: "allowed" },
    });

    expect(decision).toEqual({ allowed: true, url: "https://www.peek-poke.com/premium" });
    expect(resolveWebBillingPolicy(other, {
      ...baseConfig,
      platformModes: { ios: "denied", android: "denied", [platform]: "allowed" },
    })).toEqual({ allowed: false, reason: "platform" });
  });

  it("denies unapproved regions and storefronts", () => {
    expect(resolveWebBillingPolicy("ios", { ...baseConfig, region: "US" }))
      .toEqual({ allowed: false, reason: "region" });
    expect(resolveWebBillingPolicy("android", { ...baseConfig, storefront: "USA" }))
      .toEqual({ allowed: false, reason: "storefront" });
  });

  it("denies non-HTTPS billing links", () => {
    expect(resolveWebBillingPolicy("ios", { ...baseConfig, billingUrl: "http://example.test/premium" }))
      .toEqual({ allowed: false, reason: "url" });
  });

  it("supports denied, cancellation, and opened outcomes without native checkout", async () => {
    const opened: string[] = [];
    expect(await performWebBillingAction(
      { allowed: false, reason: "platform" },
      async () => true,
      async (url) => { opened.push(url); },
    )).toBe("denied");
    expect(await performWebBillingAction(
      { allowed: true, url: baseConfig.billingUrl },
      async () => false,
      async (url) => { opened.push(url); },
    )).toBe("cancelled");
    expect(await performWebBillingAction(
      { allowed: true, url: baseConfig.billingUrl },
      async () => true,
      async (url) => { opened.push(url); },
    )).toBe("opened");
    expect(opened).toEqual([baseConfig.billingUrl]);
  });

  it("replaces stale client roles with the backend entitlement projection", () => {
    expect(mergeAuthoritativeRoles(
      { id: "user-1", roles: ["subscriber"] },
      ["user"],
    )).toEqual({ id: "user-1", roles: ["user"] });
  });
});
