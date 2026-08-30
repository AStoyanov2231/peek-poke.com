import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorEnvelopeSchema } from "@peekpoke/shared/errors";
import { profileInterestDeleteResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "request-profile-interest-delete-auth-1";
const authBoundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  authFrom: vi.fn(),
  authSelect: vi.fn(),
  authEq: vi.fn(),
  authMaybeSingle: vi.fn(),
  createServiceClient: vi.fn(),
  serviceFrom: vi.fn(),
  serviceDelete: vi.fn(),
  serviceOr: vi.fn(),
  serviceEq: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: authBoundary.getUser },
    from: authBoundary.authFrom,
  }),
  createServiceClient: authBoundary.createServiceClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: authBoundary.enforceRateLimit,
}));

import { DELETE } from "@/app/api/profile/interests/[interestId]/route";

describe("profile interest DELETE authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authBoundary.getUser.mockResolvedValue({ data: { user: null } });
    authBoundary.authMaybeSingle.mockResolvedValue({
      data: { deleted_at: null },
      error: null,
    });
    authBoundary.authEq.mockReturnValue({ maybeSingle: authBoundary.authMaybeSingle });
    authBoundary.authSelect.mockReturnValue({ eq: authBoundary.authEq });
    authBoundary.authFrom.mockReturnValue({ select: authBoundary.authSelect });
    authBoundary.serviceEq.mockResolvedValue({ error: null });
    authBoundary.serviceOr.mockReturnValue({ eq: authBoundary.serviceEq });
    authBoundary.serviceDelete.mockReturnValue({ or: authBoundary.serviceOr });
    authBoundary.serviceFrom.mockReturnValue({ delete: authBoundary.serviceDelete });
    authBoundary.createServiceClient.mockReturnValue({ from: authBoundary.serviceFrom });
    authBoundary.enforceRateLimit.mockResolvedValue(null);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("uses the real withAuth wrapper to reject an unauthenticated request before route work", async () => {
    const interestId = "22222222-2222-4222-8222-222222222222";
    const response = await DELETE(
      new Request(`https://example.test/api/profile/interests/${interestId}`, {
        method: "DELETE",
        headers: { "x-request-id": REQUEST_ID },
      }),
      { params: Promise.resolve({ interestId }) },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(apiErrorEnvelopeSchema.parse(await response.json())).toEqual({
      version: "v1",
      error: "Unauthorized",
      message: "Unauthorized",
      code: "UNAUTHORIZED",
      request_id: REQUEST_ID,
    });
    expect(authBoundary.authFrom).not.toHaveBeenCalled();
    expect(authBoundary.enforceRateLimit).not.toHaveBeenCalled();
    expect(authBoundary.createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["soft-deleted", { deleted_at: "2026-08-07T10:00:00.000Z" }],
  ])(
    "uses the real withAuth wrapper to reject an authenticated user with a %s profile before route work",
    async (_profileState, profile) => {
      const interestId = "22222222-2222-4222-8222-222222222222";
      authBoundary.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
      authBoundary.authMaybeSingle.mockResolvedValue({ data: profile, error: null });

      const response = await DELETE(
        new Request(`https://example.test/api/profile/interests/${interestId}`, {
          method: "DELETE",
          headers: { "x-request-id": REQUEST_ID },
        }),
        { params: Promise.resolve({ interestId }) },
      );

      const body = await response.json();
      const expectedBody = {
        version: "v1",
        error: "Unauthorized",
        message: "Unauthorized",
        code: "UNAUTHORIZED",
        request_id: REQUEST_ID,
      };

      expect(response.status).toBe(401);
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(body).toEqual(expectedBody);
      expect(apiErrorEnvelopeSchema.parse(body)).toEqual(expectedBody);
      expect(authBoundary.authFrom).toHaveBeenCalledWith("profiles");
      expect(authBoundary.authMaybeSingle).toHaveBeenCalledOnce();
      expect(authBoundary.enforceRateLimit).not.toHaveBeenCalled();
      expect(authBoundary.createServiceClient).not.toHaveBeenCalled();
      expect(authBoundary.serviceDelete).not.toHaveBeenCalled();
    },
  );

  it("carries the authenticated user through the real wrapper into rate limiting and owner-scoped deletion", async () => {
    const interestId = "22222222-2222-4222-8222-222222222222";
    authBoundary.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    const response = await DELETE(
      new Request(`https://example.test/api/profile/interests/${interestId}`, {
        method: "DELETE",
        headers: { "x-request-id": REQUEST_ID },
      }),
      { params: Promise.resolve({ interestId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(profileInterestDeleteResponseSchema.parse(await response.json())).toEqual({ success: true });

    expect(authBoundary.getUser).toHaveBeenCalledOnce();
    expect(authBoundary.authFrom).toHaveBeenCalledWith("profiles");
    expect(authBoundary.authSelect).toHaveBeenCalledWith("deleted_at");
    expect(authBoundary.authEq).toHaveBeenCalledWith("id", USER_ID);
    expect(authBoundary.authMaybeSingle).toHaveBeenCalledOnce();
    expect(authBoundary.enforceRateLimit).toHaveBeenCalledWith("profileMutation", USER_ID);
    expect(authBoundary.createServiceClient).toHaveBeenCalledOnce();
    expect(authBoundary.serviceFrom).toHaveBeenCalledWith("profile_interests");
    expect(authBoundary.serviceDelete).toHaveBeenCalledOnce();
    expect(authBoundary.serviceOr).toHaveBeenCalledWith(
      `id.eq.${interestId},tag_id.eq.${interestId}`,
    );
    expect(authBoundary.serviceEq).toHaveBeenCalledWith("user_id", USER_ID);
  });
});
