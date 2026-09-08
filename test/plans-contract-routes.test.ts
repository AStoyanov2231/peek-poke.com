import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  planCreateRequestSchema,
  planJoinResponseSchema,
  planMeetupStatusResponseSchema,
  planSchema,
} from "@peekpoke/shared/plans";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(43);
const plan = {
  id: PLAN_ID,
  owner_id: USER_ID,
  activity: "Coffee",
  title: null,
  starts_at: "2027-01-15T10:00:00.000Z",
  place_text: "Studentski Grad",
  visibility: "open" as const,
  circle_id: null,
  participant_limit: 8,
  member_count: 1,
  status: "active" as const,
  created_at: "2026-09-08T10:00:00.000Z",
  updated_at: "2026-09-08T10:00:00.000Z",
  viewer_is_member: true,
  viewer_is_owner: true,
  source_thread_id: null,
};

const api = vi.hoisted(() => ({
  createPlan: vi.fn(), listPlans: vi.fn(), joinPlan: vi.fn(), leavePlan: vi.fn(), createPlanShare: vi.fn(), revokePlanShares: vi.fn(), readPublicPlanPreview: vi.fn(), readPlanMeetupStatus: vi.fn(), acknowledgePlanMeetup: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params: Promise<Record<string, string>> }) => handler(request, {
      user: { id: USER_ID }, supabase: {}, params: routeContext ? await routeContext.params : {},
    }),
}));
vi.mock("@/features/plans/server/plans", () => api);

import { GET, POST } from "@/app/api/plans/route";
import { DELETE as leave, POST as join } from "@/app/api/plans/[planId]/join/route";
import { DELETE as revokeShares, POST as share } from "@/app/api/plans/[planId]/share/route";
import { GET as publicPreview } from "@/app/api/plans/share/[token]/route";
import { GET as meetupStatus, POST as acknowledgeMeetup } from "@/app/api/plans/[planId]/meetups/route";

const planMeetupStatus = {
  acknowledgements: [{ peerId: "33333333-3333-4333-8333-333333333333", viewerConfirmed: false, peerConfirmed: false, confirmedAt: null }],
  canConfirm: true,
  closesAt: "2027-01-17T10:00:00.000Z",
};

describe("Plan API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createPlan.mockResolvedValue({ data: { plan, replayed: false } });
    api.listPlans.mockResolvedValue({ data: { plans: [plan] } });
    api.joinPlan.mockResolvedValue({ data: { plan, joined: true } });
    api.leavePlan.mockResolvedValue({ data: { left: true } });
    api.createPlanShare.mockResolvedValue({ data: { token: TOKEN, expires_at: null } });
    api.revokePlanShares.mockResolvedValue({ data: { revoked: true } });
    api.readPublicPlanPreview.mockResolvedValue({ data: {
      plan: { id: PLAN_ID, activity: "Coffee", title: null, starts_at: plan.starts_at, place_text: plan.place_text, participant_limit: 8, member_count: 1 },
      can_join: true,
    } });
    api.readPlanMeetupStatus.mockResolvedValue({ data: planMeetupStatus });
    api.acknowledgePlanMeetup.mockResolvedValue({ data: planMeetupStatus });
  });

  it("creates an owner-member plan from a bounded DTO", async () => {
    const body = { activity: " Coffee ", starts_at: plan.starts_at, place_text: " Studentski Grad ", visibility: "open" as const };
    const response = await POST(new Request("https://app.test/api/plans", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-create-key-000001" }, body: JSON.stringify(body) }), {} as never);
    expect(response.status).toBe(201);
    expect(planSchema.parse((await response.json()).plan)).toEqual(plan);
    expect(api.createPlan).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ activity: "Coffee", place_text: "Studentski Grad" }), "plan-create-key-000001");
  });

  it("requires an idempotency key before creating a Plan", async () => {
    const response = await POST(new Request("https://app.test/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activity: "Coffee", starts_at: plan.starts_at, place_text: "Sofia", visibility: "open" }) }), {} as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(api.createPlan).not.toHaveBeenCalled();
  });

  it("maps a create idempotency conflict without a duplicate mutation", async () => {
    api.createPlan.mockResolvedValue({ failure: "IDEMPOTENCY_CONFLICT" });
    const response = await POST(new Request("https://app.test/api/plans", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-create-key-000001" }, body: JSON.stringify({ activity: "Coffee", starts_at: plan.starts_at, place_text: "Sofia", visibility: "open" }) }), {} as never);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("returns a replayed Plan create as a successful non-creation", async () => {
    api.createPlan.mockResolvedValue({ data: { plan, replayed: true } });
    const response = await POST(new Request("https://app.test/api/plans", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-create-key-000001" }, body: JSON.stringify({ activity: "Coffee", starts_at: plan.starts_at, place_text: "Sofia", visibility: "open" }) }), {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan, replayed: true });
  });

  it("returns only validated plans with no-store", async () => {
    const response = await GET(new Request("https://app.test/api/plans"), {} as never);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ plans: [plan] });
  });

  it("gives a recoverable location error for an explicit nearby opt-in", async () => {
    api.createPlan.mockResolvedValue({ failure: "LOCATION_REQUIRED" });
    const response = await POST(new Request("https://app.test/api/plans", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-create-key-000001" }, body: JSON.stringify({ activity: "Coffee", starts_at: plan.starts_at, place_text: "Sofia", visibility: "open", nearby_discovery: true }) }), {} as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "LOCATION_REQUIRED" });
  });

  it("requires a durable idempotency key before join execution", async () => {
    const response = await join(new Request(`https://app.test/api/plans/${PLAN_ID}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(400);
    expect(api.joinPlan).not.toHaveBeenCalled();
  });

  it("joins using the supplied token without exposing it in the response", async () => {
    const response = await join(new Request(`https://app.test/api/plans/${PLAN_ID}/join`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-join-key-000001" }, body: JSON.stringify({ share_token: TOKEN }) }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe("plan-join-key-000001");
    expect(planJoinResponseSchema.parse(await response.json())).toEqual({ plan, joined: true });
    expect(api.joinPlan).toHaveBeenCalledWith(USER_ID, PLAN_ID, "plan-join-key-000001", { share_token: TOKEN });
  });

  it("maps a full Plan join to a safe conflict without leaking the share token", async () => {
    api.joinPlan.mockResolvedValue({ failure: "FULL" });
    const response = await join(new Request(`https://app.test/api/plans/${PLAN_ID}/join`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-join-key-000001" }, body: JSON.stringify({ share_token: TOKEN }) }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ code: "PLAN_FULL" });
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });

  it("prevents joining a Plan after its start time", async () => {
    api.joinPlan.mockResolvedValue({ failure: "EXPIRED" });
    const response = await join(new Request(`https://app.test/api/plans/${PLAN_ID}/join`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-join-key-000001" }, body: "{}" }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "PLAN_EXPIRED" });
  });

  it("only returns a share token after the owner deliberately mints one", async () => {
    const response = await share(new Request(`https://app.test/api/plans/${PLAN_ID}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ token: TOKEN, expires_at: null });
    expect(api.createPlanShare).toHaveBeenCalledWith(USER_ID, PLAN_ID, null);
  });

  it("returns only current-member Plan confirmation state without caching", async () => {
    const response = await meetupStatus(new Request(`https://app.test/api/plans/${PLAN_ID}/meetups`), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(planMeetupStatusResponseSchema.parse(await response.json())).toEqual(planMeetupStatus);
    expect(api.readPlanMeetupStatus).toHaveBeenCalledWith(USER_ID, PLAN_ID);
  });

  it("requires an idempotency key before Plan meetup confirmation", async () => {
    const response = await acknowledgeMeetup(new Request(`https://app.test/api/plans/${PLAN_ID}/meetups`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId: planMeetupStatus.acknowledgements[0].peerId }),
    }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(400);
    expect(api.acknowledgePlanMeetup).not.toHaveBeenCalled();
  });

  it("confirms an explicit Plan peer with a replay-safe key", async () => {
    const peerId = planMeetupStatus.acknowledgements[0].peerId;
    const response = await acknowledgeMeetup(new Request(`https://app.test/api/plans/${PLAN_ID}/meetups`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-meetup-key-0001" },
      body: JSON.stringify({ peerId }),
    }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe("plan-meetup-key-0001");
    expect(api.acknowledgePlanMeetup).toHaveBeenCalledWith(USER_ID, PLAN_ID, { peerId }, "plan-meetup-key-0001");
  });

  it("rejects malformed Plan meetup peer identifiers before calling the service", async () => {
    const response = await acknowledgeMeetup(new Request(`https://app.test/api/plans/${PLAN_ID}/meetups`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "plan-meetup-key-0001" },
      body: JSON.stringify({ peerId: "not-a-peer-id" }),
    }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);

    expect(response.status).toBe(400);
    expect(api.acknowledgePlanMeetup).not.toHaveBeenCalled();
  });

  it("lets a member leave without treating the owner as removable", async () => {
    const response = await leave(new Request(`https://app.test/api/plans/${PLAN_ID}/join`, { method: "DELETE" }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ left: true });
    expect(api.leavePlan).toHaveBeenCalledWith(USER_ID, PLAN_ID);
  });

  it("allows the owner to revoke every issued share token", async () => {
    const response = await revokeShares(new Request(`https://app.test/api/plans/${PLAN_ID}/share`, { method: "DELETE" }), { params: Promise.resolve({ planId: PLAN_ID }) } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: true });
    expect(api.revokePlanShares).toHaveBeenCalledWith(USER_ID, PLAN_ID);
  });

  it("fails closed when the Plan database RPC is unavailable", async () => {
    api.listPlans.mockResolvedValue({ unavailable: true });
    const response = await GET(new Request("https://app.test/api/plans"), {} as never);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toMatchObject({ code: "PLANS_UNAVAILABLE" });
  });

  it("does not cache a public token preview", async () => {
    const response = await publicPreview(new Request(`https://app.test/api/plans/share/${TOKEN}`), { params: Promise.resolve({ token: TOKEN }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain(TOKEN);
  });

  it("rejects invalid and past Plan creation DTOs", () => {
    expect(() => planCreateRequestSchema.parse({ activity: "Coffee", starts_at: "2020-01-01T00:00:00.000Z", place_text: "Sofia", visibility: "open" })).toThrow();
    expect(() => planCreateRequestSchema.parse({ activity: "Coffee\u0000", starts_at: plan.starts_at, place_text: "Sofia", visibility: "open" })).toThrow();
  });
});
