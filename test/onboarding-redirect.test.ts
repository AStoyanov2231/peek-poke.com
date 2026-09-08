import { describe, expect, it } from "vitest";
import { afterOnboardingPath, onboardingRedirect } from "@/lib/onboarding-redirect";
describe("shared Plan signup return path", () => {
  it("preserves a shared invitation without joining it", () => {
    const path = `/plan/${"a".repeat(43)}`;
    expect(afterOnboardingPath(path)).toBe(path);
    expect(new URL(onboardingRedirect(path), "https://peek-poke.test").searchParams.get("redirectTo")).toBe(path);
  });
  it("preserves existing friend invites", () => {
    const path = "/invite/1234-abcd";
    const result = new URL(onboardingRedirect(path), "https://peek-poke.test");
    expect(result.searchParams.get("invite")).toBe("1234-abcd");
    expect(result.searchParams.get("redirectTo")).toBe(path);
  });
  it.each([undefined, "https://evil.test", "//evil.test", "/login", "/onboarding?redirectTo=/login", "/api/plans"])("rejects unsafe or looping return path %s", (path) => {
    expect(afterOnboardingPath(path)).toBe("/now");
  });
});
