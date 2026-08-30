import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOnboardingFlow } from "@peekpoke/shared";
import { completeOnboarding } from "@/data/profile/api";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native onboarding completion transport", () => {
  it("returns the strict named completion DTO", async () => {
    const payload = {
      success: true,
      profile: {
        id: "11111111-1111-4111-8111-111111111111",
        username: "alice",
        onboarding_completed: true,
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));

    await expect(completeOnboarding()).resolves.toEqual(payload);
  });

  it("rejects a malformed 2xx before native onboarding advances", async () => {
    const mutateCache = vi.fn();
    const advance = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      profile: { username: "alice", onboarding_completed: true },
    }), { headers: { "x-request-id": "onboarding-native-invalid" } })));

    await expect(completeOnboardingFlow({
      request: completeOnboarding,
      commit: () => {
        mutateCache();
        advance();
      },
    })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
      requestId: "onboarding-native-invalid",
    });
    expect(mutateCache).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
});
