import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorEnvelopeSchema,
  authProfileEnsureResponseSchema,
} from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureAuthProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: boundary.getUser } }),
}));

vi.mock("@/lib/auth-profile", () => ({
  ensureAuthProfile: boundary.ensureAuthProfile,
}));

import { POST } from "@/app/api/auth/profile/route";

function request(body = "{}", contentType = "application/json", requestId = "request-auth-profile-1") {
  return POST(new Request("https://example.test/api/auth/profile", {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-request-id": requestId,
    },
    body,
  }));
}

describe("POST /api/auth/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    boundary.ensureAuthProfile.mockResolvedValue({
      status: "ready",
      created: false,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("returns the exact existing-profile response", async () => {
    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(authProfileEnsureResponseSchema.parse(payload)).toEqual({
      created: false,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    expect(boundary.ensureAuthProfile).toHaveBeenCalledWith({ id: USER_ID });
  });

  it("returns the exact created-profile response for a validated OAuth session", async () => {
    const oauthUser = { id: USER_ID, app_metadata: { provider: "google" } };
    boundary.getUser.mockResolvedValue({ data: { user: oauthUser }, error: null });
    boundary.ensureAuthProfile.mockResolvedValue({
      status: "ready",
      created: true,
      profile: { id: USER_ID, onboarding_completed: false },
    });

    const response = await request();

    await expect(response.json()).resolves.toEqual({
      created: true,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    expect(boundary.ensureAuthProfile).toHaveBeenCalledWith(oauthUser);
  });

  it.each([
    ["missing user", { data: { user: null }, error: null }],
    ["provider error", { data: { user: null }, error: { message: "provider secret" } }],
  ])("rejects a %s before privileged profile work", async (_label, authResult) => {
    boundary.getUser.mockResolvedValue(authResult);

    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(apiErrorEnvelopeSchema.parse(payload)).toMatchObject({
      code: "UNAUTHORIZED",
      request_id: "request-auth-profile-1",
    });
    expect(JSON.stringify(payload)).not.toContain("provider secret");
    expect(boundary.ensureAuthProfile).not.toHaveBeenCalled();
  });

  it("does not restore a disabled or deleted account", async () => {
    boundary.ensureAuthProfile.mockResolvedValue({ status: "disabled" });

    const response = await request();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("fails closed when atomic profile-and-role creation rolls back", async () => {
    boundary.ensureAuthProfile.mockResolvedValue({
      status: "failed",
      cause: new Error("Default user role is missing"),
    });

    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(apiErrorEnvelopeSchema.parse(payload)).toMatchObject({
      code: "PROFILE_BOOTSTRAP_FAILED",
      request_id: "request-auth-profile-1",
    });
    expect(JSON.stringify(payload)).not.toContain("Default user role");
  });

  it.each([
    ["non-JSON content", "{}", "text/plain", 415, "INVALID_REQUEST"],
    ["extra input", JSON.stringify({ user_id: USER_ID }), "application/json", 400, "VALIDATION_ERROR"],
    ["malformed JSON", "{", "application/json", 400, "VALIDATION_ERROR"],
  ])("rejects %s before profile work", async (_label, body, contentType, status, code) => {
    const response = await request(body, contentType);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(boundary.ensureAuthProfile).not.toHaveBeenCalled();
  });
});
