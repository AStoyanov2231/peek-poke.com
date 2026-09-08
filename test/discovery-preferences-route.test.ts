import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, enforceRateLimit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit }));

import { GET, PATCH } from "@/app/api/discovery-preferences/route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("discovery preferences route", () => {
  beforeEach(() => {
    rpc.mockReset();
    enforceRateLimit.mockReset();
    enforceRateLimit.mockResolvedValue(null);
  });

  it("reads only the authenticated account's preference without caching", async () => {
    rpc.mockResolvedValueOnce({ data: { audience: "everyone" }, error: null });
    const response = await GET(new Request("https://example.test/api/discovery-preferences"), {} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ audience: "everyone" });
    expect(rpc).toHaveBeenCalledWith("read_discovery_preference", { p_user_id: userId });
  });

  it("updates only the authenticated account's selected audience", async () => {
    rpc.mockResolvedValueOnce({ data: { audience: "friends" }, error: null });
    const response = await PATCH(request({ audience: "friends" }), {} as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ audience: "friends" });
    expect(enforceRateLimit).toHaveBeenCalledWith("discoveryPreferences", userId);
    expect(rpc).toHaveBeenCalledWith("update_discovery_preference", {
      p_user_id: userId,
      p_audience: "friends",
    });
  });

  it("rejects an invalid audience before calling the update RPC", async () => {
    const response = await PATCH(request({ audience: "strangers" }), {} as never);
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("https://example.test/api/discovery-preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
