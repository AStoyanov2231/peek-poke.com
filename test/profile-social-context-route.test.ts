import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, enforceRateLimit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, context?: { params?: Promise<{ userId: string }> }) => handler(request, {
      user: { id: "11111111-1111-4111-8111-111111111111" },
      params: context?.params ? await context.params : {},
    }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit }));

import { GET } from "@/app/api/profile/[userId]/social-context/route";

const viewerId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const context = {
  availability: null,
  sharedCircles: [{ id: "33333333-3333-4333-8333-333333333333", name: "Shared group" }],
  upcomingPlans: [{
    id: "44444444-4444-4444-8444-444444444444",
    owner_id: targetId,
    activity: "coffee",
    title: null,
    starts_at: "2026-09-09T12:00:00.000Z",
    place_text: "Central cafe",
    visibility: "open",
    circle_id: null,
    participant_limit: 2,
    member_count: 1,
    status: "active",
    created_at: "2026-09-08T12:00:00.000Z",
    updated_at: "2026-09-08T12:00:00.000Z",
    viewer_is_member: false,
    viewer_is_owner: false,
    source_thread_id: null,
  }],
  mutualMeetups: 1,
};

function call(userId = targetId) {
  return GET(new Request(`https://example.test/api/profile/${userId}/social-context`), {
    params: Promise.resolve({ userId }),
  } as never);
}

describe("profile social context route", () => {
  beforeEach(() => {
    rpc.mockReset();
    enforceRateLimit.mockReset();
    enforceRateLimit.mockResolvedValue(null);
  });

  it("returns only validated, no-store context for the authenticated viewer", async () => {
    rpc.mockResolvedValueOnce({ data: context, error: null });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(context);
    expect(enforceRateLimit).toHaveBeenCalledWith("profileSocialContext", viewerId);
    expect(rpc).toHaveBeenCalledWith("get_profile_social_context", {
      p_viewer_id: viewerId,
      p_target_id: targetId,
    });
  });

  it("hides blocked or deleted targets behind the same not-found response", async () => {
    rpc.mockResolvedValueOnce({ data: { error: "NOT_FOUND" }, error: null });
    const response = await call();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("rejects invalid IDs before rate limiting or database access", async () => {
    const response = await call("not-a-uuid");
    expect(response.status).toBe(400);
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
