import { describe, expect, it } from "vitest";
import { shouldClearQueryCacheForAuthChange } from "@/data/query-auth-boundary";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";

describe("profile media cross-account cache boundary", () => {
  it("clears signed owner and moderator media when the authenticated account changes", () => {
    expect(shouldClearQueryCacheForAuthChange(OWNER_A, OWNER_B)).toBe(true);
    expect(shouldClearQueryCacheForAuthChange(OWNER_A, null)).toBe(true);
  });

  it("does not clear for initialization or same-owner token refresh", () => {
    expect(shouldClearQueryCacheForAuthChange(undefined, OWNER_A)).toBe(false);
    expect(shouldClearQueryCacheForAuthChange(OWNER_A, OWNER_A)).toBe(false);
  });
});
