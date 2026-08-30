import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
}));

import { POST } from "@/app/api/coins/meeting/route";

describe("meeting rewards", () => {
  it("fails closed before reading client coordinates or invoking the reward RPC", async () => {
    const response = await POST(new Request("https://example.test/api/coins/meeting", {
      method: "POST",
      body: JSON.stringify({ friend_id: "22222222-2222-4222-8222-222222222222" }),
      headers: { "content-type": "application/json" },
    }), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCATION_VERIFICATION_UNAVAILABLE",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
