import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const POKE = "33333333-3333-4333-8333-333333333333";
const THREAD = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-09-08T10:00:00.000Z";
const rpc = vi.hoisted(() => vi.fn());
const tracked = vi.hoisted(() => vi.fn());
const recordedDiscovery = vi.hoisted(() => vi.fn());
const recordedActivation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request, routeContext?: { params?: unknown }) => handler(request, {
      user: { id: USER }, supabase: {}, params: routeContext?.params ?? {},
    }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/server-analytics", () => ({ trackProductEvent: tracked }));
vi.mock("@/lib/server-product-metrics", () => ({
  recordProductMetrics: recordedDiscovery,
  recordAvailabilityActivation: recordedActivation,
}));

import { GET as availabilityGet, PUT as availabilityPut } from "@/app/api/availability/route";
import { POST as pokePost } from "@/app/api/pokes/route";
import { PATCH as pokePatch } from "@/app/api/pokes/[pokeId]/route";

const poke = {
  id: POKE, senderId: PEER, recipientId: USER, activity: "coffee", customLabel: null,
  note: null, status: "accepted", expiresAt: NOW, createdAt: NOW, respondedAt: NOW, threadId: THREAD,
};

describe("social API routes", () => {
  beforeEach(() => { rpc.mockReset(); tracked.mockReset(); recordedDiscovery.mockReset(); recordedActivation.mockReset(); });

  it("bounds discovery and forwards only a capped server radius", async () => {
    rpc.mockResolvedValue({ data: { availability: null, people: [] }, error: null });
    const response = await availabilityGet(new Request("https://app.test/api/availability?limit=20&radiusKm=25"), {} as never);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_available_people", { p_viewer_id: USER, p_limit: 20, p_radius_km: 25 });
    expect(recordedDiscovery).toHaveBeenCalledWith(USER, []);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const invalid = await availabilityGet(new Request("https://app.test/api/availability?radiusKm=26"), {} as never);
    expect(invalid.status).toBe(400);
  });

  it("uses the versioned discovery RPC only after explicit context opt-in", async () => {
    rpc.mockResolvedValue({ data: { availability: null, people: [] }, error: null });
    const response = await availabilityGet(new Request("https://app.test/api/availability?discovery_context=1"), {} as never);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_available_people_v2", { p_viewer_id: USER, p_limit: 20, p_radius_km: 25 });

    const invalid = await availabilityGet(new Request("https://app.test/api/availability?discovery_context=0"), {} as never);
    expect(invalid.status).toBe(400);
  });

  it("records first availability activation only after a validated successful mutation", async () => {
    rpc.mockResolvedValue({ data: { availability: {
      id: POKE, userId: USER, activity: "coffee", customLabel: null,
      expiresAt: NOW, createdAt: NOW, updatedAt: NOW,
    } }, error: null });
    const response = await availabilityPut(new Request("https://app.test/api/availability", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ activity: "coffee", customLabel: null, durationMinutes: 60 }),
    }), {} as never);
    expect(response.status).toBe(200);
    expect(recordedActivation).toHaveBeenCalledWith(USER);
    expect(tracked).toHaveBeenCalledWith({ name: "availability_created", activity: "coffee" });
  });

  it("requires idempotency before a poke can be sent", async () => {
    const response = await pokePost(new Request("https://app.test/api/pokes", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: PEER, activity: "coffee", customLabel: null }),
    }), {} as never);
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records a successful acceptance once and returns its accessible thread", async () => {
    rpc.mockResolvedValue({ data: { poke, threadId: THREAD, replayed: false }, error: null });
    const response = await pokePatch(new Request(`https://app.test/api/pokes/${POKE}`, {
      method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "social-response-00001" },
      body: JSON.stringify({ action: "accept" }),
    }), { params: { pokeId: POKE } } as never);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("respond_to_poke", {
      p_recipient_id: USER, p_poke_id: POKE, p_action: "accept", p_idempotency_key: "social-response-00001",
    });
    await expect(response.json()).resolves.toMatchObject({ threadId: THREAD, poke: { threadId: THREAD } });
    expect(tracked).toHaveBeenCalledWith({ name: "poke_accepted", activity: "coffee" });
  });

  it.each([{}, { note: null }])("sends a Poke without a note through both validation boundaries: %j", async (optionalNote) => {
    rpc.mockResolvedValue({ data: { poke: { ...poke, senderId: USER, recipientId: PEER, status: "pending", respondedAt: null, threadId: null }, replayed: false }, error: null });
    const response = await pokePost(new Request("https://app.test/api/pokes", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "social-create-no-note-01" },
      body: JSON.stringify({ recipientId: PEER, activity: "coffee", customLabel: null, ...optionalNote }),
    }), {} as never);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_poke", { p_sender_id: USER, p_recipient_id: PEER, p_activity: "coffee", p_custom_label: null, p_note: null, p_idempotency_key: "social-create-no-note-01" });
  });
});
