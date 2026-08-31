import { describe, expect, it } from "vitest";
import {
  DISCOVERY_REFRESH_INTERVAL_MS,
  isAbortError,
  shouldRunDiscovery,
} from "@/data/discovery/policy";

describe("discovery request policy", () => {
  it("runs only for an authenticated, focused, foreground map", () => {
    expect(shouldRunDiscovery(true, "active", true)).toBe(true);
    expect(shouldRunDiscovery(false, "active", true)).toBe(false);
    expect(shouldRunDiscovery(true, "background", true)).toBe(false);
    expect(shouldRunDiscovery(true, "inactive", true)).toBe(false);
    expect(shouldRunDiscovery(true, "active", false)).toBe(false);
  });

  it("uses the required adaptive polling window", () => {
    expect(DISCOVERY_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(DISCOVERY_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it("distinguishes cancellation from request failures", () => {
    const aborted = new Error("cancelled");
    aborted.name = "AbortError";
    expect(isAbortError(aborted)).toBe(true);
    expect(isAbortError(new Error("network"))).toBe(false);
  });
});
