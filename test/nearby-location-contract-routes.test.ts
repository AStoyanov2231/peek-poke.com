import { describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: () => ({ upsert }), rpc }),
}));

import { POST as nearby } from "@/app/api/nearby/route";
import { POST as location } from "@/app/api/location/route";

describe("location attestation boundary", () => {
  it.each([
    ["location", location, "/api/location"],
    ["nearby", nearby, "/api/nearby"],
  ])("fails closed for %s without storing or querying client coordinates", async (_name, handler, path) => {
    const response = await handler(new Request(`https://example.test${path}`, {
      method: "POST",
      body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCATION_VERIFICATION_UNAVAILABLE",
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
