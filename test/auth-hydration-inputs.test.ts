import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const login = readFileSync("src/features/auth/components/LoginPage.tsx", "utf8");
const reset = readFileSync("src/features/auth/components/ResetPasswordPage.tsx", "utf8");

describe("auth hydration input safety", () => {
  it("keeps controlled credentials inert until React hydration", () => {
    expect(login.match(/disabled=\{!hydrated\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(login).toContain("disabled={!hydrated || loading || oauthLoading !== null}");
    expect(reset.match(/disabled=\{!hydrated\}/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
