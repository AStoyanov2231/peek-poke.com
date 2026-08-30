import { describe, expect, it, vi } from "vitest";
import { completeOnboardingFlow, onboardingLoadState } from "@peekpoke/shared";
import { onboardingKeyboardBehavior } from "@/lib/onboarding-platform";

describe("native onboarding behavior policy", () => {
  it("exposes retry and refetches both initial resources", async () => {
    const refetchProfile = vi.fn(async () => undefined);
    const refetchInterests = vi.fn(async () => undefined);
    const state = onboardingLoadState({
      pending: false,
      failed: true,
      scope: "initial",
      reload: [refetchProfile, refetchInterests],
    });

    expect(state).toMatchObject({
      kind: "error",
      message: "Onboarding couldn't be loaded.",
      action: { label: "Try again" },
    });
    if (state.kind !== "error") throw new Error("Expected recoverable error state");

    await state.action.run();
    expect(refetchProfile).toHaveBeenCalledOnce();
    expect(refetchInterests).toHaveBeenCalledOnce();
  });

  it("uses the selected iOS or Android keyboard branch", () => {
    const platform = process.env.NATIVE_TEST_PLATFORM === "ios" ? "ios" : "android";
    expect(onboardingKeyboardBehavior()).toBe(platform === "ios" ? "padding" : undefined);
  });

  it("does not mutate query data or advance when completion validation rejects", async () => {
    const setQueryData = vi.fn();
    const invalidateBootstrap = vi.fn();
    const advance = vi.fn();

    await expect(completeOnboardingFlow({
      request: async () => { throw new Error("INVALID_RESPONSE"); },
      commit: async () => {
        setQueryData();
        await invalidateBootstrap();
        advance();
      },
    })).rejects.toThrow("INVALID_RESPONSE");

    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateBootstrap).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
});
