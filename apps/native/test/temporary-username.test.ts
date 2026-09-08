import { describe, expect, it } from "vitest";
import { isTemporaryUsername } from "@peekpoke/shared";

describe("temporary onboarding usernames", () => {
  it.each(["user_deadbeef", "user_deadbeef1234567"])("recognizes generated %s", (username) => {
    expect(isTemporaryUsername(username)).toBe(true);
  });

  it("preserves chosen usernames", () => {
    expect(isTemporaryUsername("user_personal_name")).toBe(false);
    expect(isTemporaryUsername("alex_123")).toBe(false);
  });
});
