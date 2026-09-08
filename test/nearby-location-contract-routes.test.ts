import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: () => ({ upsert }), rpc }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { POST as nearby } from "@/app/api/nearby/route";
import { POST as location } from "@/app/api/location/route";

describe("approximate discovery location endpoints", () => {
  beforeEach(() => {
    upsert.mockReset();
    rpc.mockReset();
  });

  it("persists a permissioned location for discovery with no location reward claim", async () => {
    upsert.mockResolvedValue({ error: null });
    const response = await location(new Request("https://example.test/api/location", {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "11111111-1111-4111-8111-111111111111",
      lat: 42.6977,
      lng: 23.3219,
    }), { onConflict: "user_id" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads only a coarse, validated nearby DTO from the server RPC", async () => {
    rpc.mockResolvedValue({ data: [{
      user_id: "22222222-2222-4222-8222-222222222222",
      username: "ada",
      display_name: "Ada",
      avatar_url: null,
      is_online: true,
      last_seen_at: null,
      lat: 42.7,
      lng: 23.32,
    }], error: null });
    const response = await nearby(new Request("https://example.test/api/nearby", {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      users: [expect.objectContaining({ lat: 42.7, lng: 23.32 })],
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("nearby_users_for_user", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_radius_km: 2,
    });
  });

  it("fails closed when the RPC attempts to expose an unquantized coordinate", async () => {
    rpc.mockResolvedValue({ data: [{
      user_id: "22222222-2222-4222-8222-222222222222",
      username: "ada",
      display_name: "Ada",
      avatar_url: null,
      is_online: true,
      last_seen_at: null,
      lat: 42.697,
      lng: 23.32,
    }], error: null });
    const response = await nearby(new Request("https://example.test/api/nearby", {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "NEARBY_UNAVAILABLE" });
  });
});
