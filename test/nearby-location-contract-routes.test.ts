import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { POST as nearby } from "@/app/api/nearby/route";
import { POST as location } from "@/app/api/location/route";

describe("legacy GPS location boundary", () => {
  it("accepts client GPS without marking it as verified", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const response = await location(new Request("https://example.test/api/location", {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("upsert_user_location", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_lat: 42.6977,
      p_lng: 23.3219,
    });
  });

  it("returns nearby users for a fresh legacy GPS location", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const response = await nearby(new Request("https://example.test/api/nearby", {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ users: [] });
  });
});
