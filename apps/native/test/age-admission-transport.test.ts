/* eslint-disable import/first -- transport dependencies must be mocked before subject imports. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: JSON.stringify,
}));

import { fetchAgeAdmission, submitAgeAdmission } from "@/data/age-admission";
import {
  ageAdmissionReturnIntent,
  canRefreshAdultRealtimeSession,
  canStartAgeRestrictedServices,
  publicPlanJoinDestination,
  requiresAgeAdmissionRoute,
} from "@/lib/age-admission-navigation";

describe("native age-admission transport and navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the direct no-store admission endpoint without storing raw DOB in a query cache", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "pending", decided_at: null });

    await expect(fetchAgeAdmission()).resolves.toEqual({ status: "pending", decided_at: null });
    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/age-admission", expect.objectContaining({
      responseSchema: expect.anything(),
    }));
  });

  it("posts only the strict ISO birth-date declaration and validates the response", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "adult", decided_at: "2026-09-08T00:00:00.000Z" });

    await expect(submitAgeAdmission("2000-02-29")).resolves.toMatchObject({ status: "adult" });
    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/age-admission", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ birth_date: "2000-02-29" }),
      responseSchema: expect.anything(),
    }));
  });

  it("gates every route until adult while preserving only vetted invite or plan intent", () => {
    const pending = { status: "pending", decided_at: null } as const;
    const blocked = { status: "blocked", decided_at: "2026-09-08T00:00:00.000Z" } as const;

    expect(requiresAgeAdmissionRoute("/chat/anything", pending)).toBe(true);
    expect(requiresAgeAdmissionRoute("/age-admission", pending)).toBe(false);
    expect(requiresAgeAdmissionRoute("/auth/reset-password", pending)).toBe(false);
    expect(requiresAgeAdmissionRoute("/plan/valid", pending, true)).toBe(false);
    expect(requiresAgeAdmissionRoute("/plans/anything", blocked)).toBe(true);
    expect(requiresAgeAdmissionRoute("/now", { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" })).toBe(false);
    expect(ageAdmissionReturnIntent("11111111-1111-4111-8111-111111111111", "a".repeat(43))).toEqual({
      invite: "11111111-1111-4111-8111-111111111111",
      plan_token: "a".repeat(43),
    });
  });

  it("keeps a public plan preview readable but gates a pending signed-in join", () => {
    const pending = { status: "pending", decided_at: null } as const;
    const adult = { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" } as const;
    const token = "a".repeat(43);

    expect(publicPlanJoinDestination({ token, hasSession: false, admission: null })).toEqual({
      pathname: "/(auth)/login",
      params: { plan_token: token },
    });
    expect(publicPlanJoinDestination({ token, hasSession: true, admission: pending })).toEqual({
      pathname: "/age-admission",
      params: { plan_token: token },
    });
    expect(publicPlanJoinDestination({ token, hasSession: true, admission: adult })).toBeNull();
  });

  it("withholds account services across an adult-to-pending account switch and pending token refresh", () => {
    const adult = { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" } as const;
    const pending = { status: "pending", decided_at: null } as const;

    expect(canStartAgeRestrictedServices({
      admission: adult,
      candidateUserId: "adult-account",
      currentBootstrapUserId: "adult-account",
      latestBootstrap: true,
    })).toBe(true);
    expect(canStartAgeRestrictedServices({
      admission: pending,
      candidateUserId: "pending-account",
      currentBootstrapUserId: "pending-account",
      latestBootstrap: true,
    })).toBe(false);
    expect(canStartAgeRestrictedServices({
      admission: adult,
      candidateUserId: "adult-account",
      currentBootstrapUserId: "pending-account",
      latestBootstrap: false,
    })).toBe(false);
    expect(canRefreshAdultRealtimeSession(adult)).toBe(true);
    expect(canRefreshAdultRealtimeSession(pending)).toBe(false);
  });
});
