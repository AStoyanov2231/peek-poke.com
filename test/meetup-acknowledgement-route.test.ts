import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, trackProductEvent } = vi.hoisted(() => ({
  rpc: vi.fn(),
  trackProductEvent: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/server-analytics", () => ({ trackProductEvent }));

import { GET, POST } from "@/app/api/meetups/route";

const actorId = "11111111-1111-4111-8111-111111111111";
const peerId = "22222222-2222-4222-8222-222222222222";
const key = "meetup-acknowledgement-key-0001";
const waitingMeetup = {
  id: "33333333-3333-4333-8333-333333333333",
  peerId,
  status: "waiting",
  viewerConfirmed: true,
  expiresAt: "2026-09-10T00:00:00.000Z",
  confirmedAt: null,
};

describe("meetup acknowledgement route", () => {
  beforeEach(() => {
    rpc.mockReset();
    trackProductEvent.mockReset();
  });

  it("reads only the authenticated participant's current pair state", async () => {
    rpc.mockResolvedValueOnce({ data: { meetup: waitingMeetup }, error: null });
    const response = await GET(new Request(`https://example.test/api/meetups?peerId=${peerId}`), {} as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ meetup: waitingMeetup });
    expect(rpc).toHaveBeenCalledWith("read_meetup_acknowledgement", {
      p_actor_id: actorId,
      p_peer_id: peerId,
    });
  });

  it("rejects a missing or blocked peer read", async () => {
    await expect(GET(new Request("https://example.test/api/meetups"), {} as never)).resolves.toMatchObject({ status: 400 });
    rpc.mockResolvedValueOnce({ data: { error: "BLOCKED" }, error: null });
    const blocked = await GET(new Request(`https://example.test/api/meetups?peerId=${peerId}`), {} as never);
    expect(blocked.status).toBe(404);
    await expect(blocked.json()).resolves.toMatchObject({ code: "BLOCKED" });
  });

  it("requires an idempotency key", async () => {
    const response = await POST(request(), {} as never);
    expect(response.status).toBe(400);
  });

  it("returns participant-private directional waiting state", async () => {
    rpc.mockResolvedValueOnce({ data: { meetup: waitingMeetup, replayed: false }, error: null });
    const response = await POST(request(key), {} as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ meetup: waitingMeetup, replayed: false });
    expect(rpc).toHaveBeenCalledWith("acknowledge_meetup_idempotent", expect.objectContaining({
      p_actor_id: actorId,
      p_peer_id: peerId,
      p_operation: "meetup:acknowledge",
      p_idempotency_key: key,
      p_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("records analytics only for a non-replayed reciprocal confirmation", async () => {
    const confirmed = { ...waitingMeetup, status: "confirmed", viewerConfirmed: true, confirmedAt: "2026-09-08T12:00:00.000Z" };
    rpc.mockResolvedValueOnce({ data: { meetup: confirmed, replayed: false, confirmed_transition: true }, error: null });
    await expect(POST(request(key), {} as never)).resolves.toMatchObject({ status: 200 });
    expect(trackProductEvent).toHaveBeenCalledWith({ name: "meet_created" });

    rpc.mockResolvedValueOnce({ data: { meetup: confirmed, replayed: true, confirmed_transition: true }, error: null });
    await expect(POST(request("meetup-acknowledgement-key-0002"), {} as never)).resolves.toMatchObject({ status: 200 });
    expect(trackProductEvent).toHaveBeenCalledTimes(1);
  });

  it("does not convert an ineligible social connection into a meeting claim", async () => {
    rpc.mockResolvedValueOnce({ data: { error: "NOT_ELIGIBLE" }, error: null });
    const response = await POST(request("meetup-acknowledgement-key-0003"), {} as never);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

function request(idempotencyKey?: string) {
  return new Request("https://example.test/api/meetups", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ peerId }),
  });
}
