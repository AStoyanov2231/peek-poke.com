import { describe, expect, it } from "vitest";
import {
  onboardingCompleteResponseSchema,
  onboardingRecoveryPolicy,
  profileInterestDeleteResponseSchema,
} from "@peekpoke/shared";

const completedProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "alice",
  onboarding_completed: true,
};

describe("onboarding shared contract", () => {
  it("accepts only the named completion DTO", () => {
    expect(onboardingCompleteResponseSchema.parse({
      success: true,
      profile: completedProfile,
    })).toEqual({ success: true, profile: completedProfile });

    expect(onboardingCompleteResponseSchema.safeParse({
      success: true,
      profile: { ...completedProfile, deleted_at: null },
    }).success).toBe(false);
    expect(onboardingCompleteResponseSchema.safeParse({
      success: "yes",
      profile: completedProfile,
    }).success).toBe(false);
  });

  it("rejects malformed interest-deletion success payloads", () => {
    expect(profileInterestDeleteResponseSchema.safeParse({ success: true }).success).toBe(true);
    expect(profileInterestDeleteResponseSchema.safeParse({}).success).toBe(false);
    expect(profileInterestDeleteResponseSchema.safeParse({ success: true, id: "raw-row" }).success).toBe(false);
  });

  it("defines one recoverable loading policy for web, iOS, and Android", () => {
    expect(onboardingRecoveryPolicy).toEqual({
      initial: { message: "Onboarding couldn't be loaded.", action: "Try again" },
      interests: { message: "Interests couldn't be loaded.", action: "Try again" },
    });
  });
});
