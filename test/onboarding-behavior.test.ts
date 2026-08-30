import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeOnboardingFlow,
  onboardingCompleteResponseSchema,
  onboardingLoadState,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web onboarding behavior policy", () => {
  it("exposes an actionable retry after the initial load fails", async () => {
    const reload = vi.fn(async () => undefined);
    const state = onboardingLoadState({
      pending: false,
      failed: true,
      scope: "initial",
      reload: [reload],
    });

    expect(state).toMatchObject({
      kind: "error",
      message: "Onboarding couldn't be loaded.",
      action: { label: "Try again" },
    });
    if (state.kind !== "error") throw new Error("Expected recoverable error state");

    await state.action.run();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not commit or advance when completion validation rejects", async () => {
    const mutateCache = vi.fn();
    const advance = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      profile: { username: "alice", onboarding_completed: true },
    }), { headers: { "x-request-id": "malformed-web-onboarding" } })));

    await expect(completeOnboardingFlow({
      request: () => fetchContract(
        "/api/profile/complete-onboarding",
        onboardingCompleteResponseSchema,
        { method: "POST" },
      ),
      commit: () => {
        mutateCache();
        advance();
      },
    })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
      requestId: "malformed-web-onboarding",
    });

    expect(mutateCache).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
});
