import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { GET } from "@/app/api/bots/route";

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
});
