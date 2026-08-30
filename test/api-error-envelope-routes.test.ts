import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorEnvelopeSchema, contractErrorFailure } from "@peekpoke/shared/errors";
import { withRequestContext } from "@/lib/request-context";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const database = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    withRequestContext(async (request: Request, routeContext?: { params: Promise<unknown> }) =>
      handler(request, {
        user: { id: USER_ID },
        supabase: {},
        params: routeContext ? await routeContext.params : {},
      })
    ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: database.from }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  notifyFriendshipChanged: vi.fn(),
}));

import { GET as getInterests } from "@/app/api/interests/route";
import { POST as blockUser } from "@/app/api/users/[userId]/block/route";

async function expectCanonicalError(
  response: Response,
  expected: { status: number; code: string; message: string; requestId: string },
) {
  const payload = await response.json();
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("x-request-id")).toBe(expected.requestId);
  expect(apiErrorEnvelopeSchema.parse(payload)).toEqual({
    version: "v1",
    error: expected.message,
    message: expected.message,
    code: expected.code,
    request_id: expected.requestId,
  });

  const webFailure = contractErrorFailure(payload, response.status, response.headers.get("x-request-id"));
  const nativeFailure = contractErrorFailure(payload, response.status, response.headers.get("x-request-id"));
  expect(nativeFailure).toEqual(webFailure);
  return payload;
}

describe("client-facing API error envelopes", () => {
  beforeEach(() => {
    database.order.mockResolvedValue({ data: null, error: { message: "database secret" } });
    database.select.mockReturnValue({ order: database.order });
    database.from.mockReturnValue({ select: database.select });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("returns a safe canonical envelope from a public data route", async () => {
    const response = await getInterests(new Request("https://example.test/api/interests", {
      headers: { "x-request-id": "request-public-data-1" },
    }));

    const payload = await expectCanonicalError(response, {
      status: 500,
      code: "INTERESTS_FETCH_FAILED",
      message: "Internal server error",
      requestId: "request-public-data-1",
    });
    expect(JSON.stringify(payload)).not.toContain("database secret");
  });

  it("returns the same contract from an authenticated mutation route", async () => {
    const response = await blockUser(
      new Request("https://example.test/api/users/not-a-user/block", {
        method: "POST",
        headers: { "x-request-id": "request-native-mutation-1" },
      }),
      { params: Promise.resolve({ userId: "not-a-user" }) } as never,
    );

    await expectCanonicalError(response, {
      status: 400,
      code: "INVALID_USER_ID",
      message: "Invalid user ID",
      requestId: "request-native-mutation-1",
    });
  });
});
