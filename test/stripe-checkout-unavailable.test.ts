import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request) => handler(request, { user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));

vi.mock("@/lib/auth", () => auth);

import { POST } from "@/app/api/stripe/checkout/route";

describe("Stripe checkout availability", () => {
  it("fails closed before any checkout side effect can run", async () => {
    const response = await POST(new Request("https://app.test/api/stripe/checkout", { method: "POST" }), {} as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "NOT_AVAILABLE" });
  });
});
