import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { GET, POST } from "@/app/api/bots/route";

beforeEach(() => rpc.mockReset());

describe("location-based bot listing", () => {
  it("validates the client query and reads bots through the service-role RPC", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: "22222222-2222-4222-8222-222222222222", lat: 42.697, lng: 23.322 }], error: null });
    const response = await GET(new Request("https://example.test/api/bots?lat=42.6977&lng=23.3219"), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "22222222-2222-4222-8222-222222222222", lat: 42.697, lng: 23.322 },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_admin_coins_for_user", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("collects through the service-role collection RPC", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, balance: 4 }, error: null });
    const response = await POST(new Request("https://example.test/api/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        lat: 42.6977,
        lng: 23.3219,
      }),
    }), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, balance: 4 });
    expect(rpc).toHaveBeenCalledWith("collect_admin_coin_for_user", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_coin_id: "22222222-2222-4222-8222-222222222222",
    });
  });
});
