import { describe, expect, it } from "vitest";
import { getRecoveryAction, getRecoveryContent } from "@/components/recovery-copy";

describe("recovery copy", () => {
  it("gives network failures an actionable offline state", () => {
    expect(getRecoveryContent({ status: 0, code: "NETWORK_UNAVAILABLE" })).toEqual({
      title: "You're offline",
      message: "Check your connection and try again.",
    });
  });

  it("keeps screen context for service failures", () => {
    expect(getRecoveryContent({ status: 503 }, "Couldn't load inbox")).toEqual({
      title: "Couldn't load inbox",
      message: "We couldn't reach Peek & Poke. Try again in a moment.",
    });
  });

  it("does not expose raw server error messages", () => {
    expect(getRecoveryContent(new Error("database connection string leaked"))).toEqual({
      title: "Something went wrong",
      message: "An unexpected error occurred.",
    });
  });

  it("retains an opaque digest for support", () => {
    expect(getRecoveryContent({ digest: "abc123", status: 400 })).toEqual({
      title: "Something went wrong",
      message: "Error ID: abc123",
    });
  });

  it("turns an expired session into a real sign-in action", () => {
    expect(getRecoveryAction({ status: 401, code: "UNAUTHORIZED" })).toEqual({
      kind: "reauthenticate",
      label: "Sign in again",
    });
    expect(getRecoveryAction({ status: 503 })).toEqual({
      kind: "retry",
      label: "Try again",
    });
  });
});
