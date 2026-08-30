import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorEnvelopeSchema } from "@peekpoke/shared/errors";
import { profileInterestDeleteResponseSchema } from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "request-profile-interest-delete-1";
const database = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  delete: vi.fn(),
  or: vi.fn(),
}));
const routeMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => null as Response | null),
}));

vi.mock("@/lib/auth", async () => {
  const { withRequestContext } = await vi.importActual<
    typeof import("@/lib/request-context")
  >("@/lib/request-context");

  return {
    withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
      withRequestContext(async (
        request: Request,
        routeContext?: { params?: Promise<Record<string, string>> },
      ) => handler(request, {
        user: { id: USER_ID },
        params: routeContext?.params ? await routeContext.params : {},
        supabase: {
          from: () => { throw new Error("caller-scoped data client must not be used"); },
        },
      })),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: routeMocks.enforceRateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: database.from }),
}));

import { GET } from "@/app/api/profile/interests/route";
import { DELETE } from "@/app/api/profile/interests/[interestId]/route";

describe("profile interests API read boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.enforceRateLimit.mockResolvedValue(null);
    database.order.mockResolvedValue({ data: [], error: null });
    database.eq.mockReturnValue({ order: database.order });
    database.select.mockReturnValue({ eq: database.eq });
    database.from.mockReturnValue({ select: database.select });
  });

  it("reads only the authenticated owner's named fields through the server client", async () => {
    const response = await GET(new Request("https://example.test/api/profile/interests"), {} as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ interests: [] });
    expect(database.from).toHaveBeenCalledWith("profile_interests");
    expect(database.select).toHaveBeenCalledWith(expect.not.stringContaining("*"));
    expect(database.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });
});

describe("profile interests API delete boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.enforceRateLimit.mockResolvedValue(null);
    database.eq.mockResolvedValue({ error: null });
    database.or.mockReturnValue({ eq: database.eq });
    database.delete.mockReturnValue({ or: database.or });
    database.from.mockReturnValue({ delete: database.delete });
  });

  it("deletes by row or tag id while always scoping the mutation to the authenticated owner", async () => {
    const interestId = "22222222-2222-4222-8222-222222222222";
    const response = await DELETE(
      deleteRequest(interestId),
      { params: Promise.resolve({ interestId }) } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(profileInterestDeleteResponseSchema.parse(await response.json())).toEqual({ success: true });
    expect(routeMocks.enforceRateLimit).toHaveBeenCalledWith("profileMutation", USER_ID);
    expect(database.from).toHaveBeenCalledWith("profile_interests");
    expect(database.delete).toHaveBeenCalledOnce();
    expect(database.or).toHaveBeenCalledWith(`id.eq.${interestId},tag_id.eq.${interestId}`);
    expect(database.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("rejects an invalid interest ID with the canonical envelope before rate limiting or deletion", async () => {
    const response = await DELETE(
      deleteRequest("not-an-interest-id"),
      { params: Promise.resolve({ interestId: "not-an-interest-id" }) } as never,
    );

    await expectCanonicalError(response, 400, "INTEREST_NOT_FOUND", "Invalid interest ID");
    expect(routeMocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(database.from).not.toHaveBeenCalled();
    expect(database.delete).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response unchanged and does not touch the database", async () => {
    routeMocks.enforceRateLimit.mockImplementationOnce(async () => {
      const response = apiError("Too many requests", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", "30");
      return response;
    });
    const interestId = "22222222-2222-4222-8222-222222222222";

    const response = await DELETE(
      deleteRequest(interestId),
      { params: Promise.resolve({ interestId }) } as never,
    );

    await expectCanonicalError(response, 429, "RATE_LIMITED", "Too many requests");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(routeMocks.enforceRateLimit).toHaveBeenCalledWith("profileMutation", USER_ID);
    expect(database.from).not.toHaveBeenCalled();
    expect(database.delete).not.toHaveBeenCalled();
  });

  it("returns a safe canonical error when the owner-scoped deletion fails", async () => {
    database.eq.mockResolvedValueOnce({ error: { message: "database secret" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const interestId = "22222222-2222-4222-8222-222222222222";

    const response = await DELETE(
      deleteRequest(interestId),
      { params: Promise.resolve({ interestId }) } as never,
    );

    const payload = await expectCanonicalError(
      response,
      500,
      "INTEREST_DELETE_FAILED",
      "Internal server error",
    );
    expect(JSON.stringify(payload)).not.toContain("database secret");
    expect(database.or).toHaveBeenCalledWith(`id.eq.${interestId},tag_id.eq.${interestId}`);
    expect(database.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });
});

function deleteRequest(interestId: string) {
  return new Request(`https://example.test/api/profile/interests/${interestId}`, {
    method: "DELETE",
    headers: { "x-request-id": REQUEST_ID },
  });
}

async function expectCanonicalError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  const payload = apiErrorEnvelopeSchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  expect(payload).toEqual({
    version: "v1",
    error: message,
    message,
    code,
    request_id: REQUEST_ID,
  });
  return payload;
}
