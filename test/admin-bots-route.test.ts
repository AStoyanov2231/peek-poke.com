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
  it("is rate limited and fails closed without calling the service-role RPC", async () => {
    const response = await GET(new Request("https://example.test/api/bots?lat=42.6977&lng=23.3219"), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCATION_VERIFICATION_UNAVAILABLE",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
