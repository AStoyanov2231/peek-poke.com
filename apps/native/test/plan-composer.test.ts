import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })) } } }));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

import { planDraftDefaults, planRequestFromDraft } from "@/components/plan-composer-data";
import { createPlan } from "@/data/plans";

const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("native Plan composer", () => {
  it("defaults to private and requires an explicit time", () => {
    expect(planDraftDefaults()).toMatchObject({ visibility: "private", date: "", time: "", activity: "", placeText: "", nearbyDiscovery: false });
  });

  it("builds the confirmed body with a Circle and source thread only when selected", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T08:00:00Z"));
    const body = planRequestFromDraft({ activity: " Coffee ", title: "After work", date: "2026-09-10", time: "18:30", placeText: " Center ", participantLimit: "4", visibility: "circle", circleId: PLAN_ID, nearbyDiscovery: false }, THREAD_ID);
    expect(body).toEqual({ activity: "Coffee", title: "After work", starts_at: new Date("2026-09-10T18:30:00").toISOString(), place_text: "Center", participant_limit: 4, visibility: "circle", circle_id: PLAN_ID, source_thread_id: THREAD_ID, nearby_discovery: false });
  });

  it("rejects normalized invalid dates and keeps nearby discovery explicit", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T08:00:00Z"));
    const draft = { ...planDraftDefaults(), activity: "Coffee", date: "2026-02-30", time: "18:30", placeText: "Café" };
    expect(() => planRequestFromDraft(draft)).toThrow("doesn’t exist");
    expect(() => planRequestFromDraft({ ...draft, date: "2026-02-20", time: "24:30" })).toThrow("Choose a date");
    expect(planRequestFromDraft({ ...draft, date: "2026-02-20", visibility: "open", nearbyDiscovery: true }).nearby_discovery).toBe(true);
    expect(planRequestFromDraft({ ...draft, date: "2026-02-20", nearbyDiscovery: true }).nearby_discovery).toBe(false);
  });

  it("uses the supplied stable idempotency key for a create retry", async () => {
    const response = { plan: { id: PLAN_ID, owner_id: PLAN_ID, activity: "Coffee", title: null, starts_at: "2026-09-10T18:30:00.000Z", place_text: "Center", visibility: "private", circle_id: null, participant_limit: 4, member_count: 1, status: "active", created_at: "2026-09-09T10:00:00.000Z", updated_at: "2026-09-09T10:00:00.000Z", viewer_is_member: true, viewer_is_owner: true, source_thread_id: null }, replayed: false };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    const body = { activity: "Coffee", starts_at: "2026-09-10T18:30:00.000Z", place_text: "Center", visibility: "private" as const, participant_limit: 4 };
    await createPlan(body, { idempotencyKey: THREAD_ID });
    await createPlan(body, { idempotencyKey: THREAD_ID });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) expect(new Headers(init?.headers).get("idempotency-key")).toBe(THREAD_ID);
  });
});
