import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const USER_B_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "ExpoPushToken[device-token]";
const ACCESS_TOKEN_A = "header.payload.signature-a";
const ACCESS_TOKEN_A_REFRESHED = "header.payload.signature-a-refreshed";

const database = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ error: null })),
}));
const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: USER_A_ID },
      supabase: { auth: { getClaims: auth.getClaims } },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

import { DELETE, POST } from "@/app/api/profile/push-token/route";

describe("/api/profile/push-token auth boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockResolvedValue({ error: null });
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: USER_A_ID, session_id: SESSION_A_ID, iat: 123 } },
      error: null,
    });
  });

  it("passes the exact native bearer token to claim verification before fenced POST and DELETE", async () => {
    const postResponse = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN_A}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);
    const deleteResponse = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN_A}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: TOKEN }),
    }), {} as never);

    expect(postResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(auth.getClaims).toHaveBeenNthCalledWith(1, ACCESS_TOKEN_A);
    expect(auth.getClaims).toHaveBeenNthCalledWith(2, ACCESS_TOKEN_A);
    expect(database.rpc).toHaveBeenNthCalledWith(1, "upsert_push_device_v2", expect.objectContaining({
      p_user_id: USER_A_ID,
      p_session_id: SESSION_A_ID,
    }));
    expect(database.rpc).toHaveBeenNthCalledWith(2, "revoke_push_device_v2", expect.objectContaining({
      p_user_id: USER_A_ID,
      p_session_id: SESSION_A_ID,
    }));
  });

  it("supports the already-authenticated web cookie client without inventing a bearer token", async () => {
    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: {
        cookie: "sb-project-auth-token=opaque-cookie-value",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(200);
    expect(auth.getClaims).toHaveBeenCalledWith();
    expect(database.rpc).toHaveBeenCalledWith("upsert_push_device_v2", expect.objectContaining({
      p_session_id: SESSION_A_ID,
    }));
  });

  it("fails a missing credential closed when the cookie auth client has no verified claims", async () => {
    auth.getClaims.mockResolvedValueOnce({ data: { claims: null }, error: { message: "no session" } });

    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(401);
    expect(auth.getClaims).toHaveBeenCalledWith();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "Basic opaque-credential",
    "Bearer",
    "Bearer ",
    "bearer header.payload.signature",
    "Bearer token with spaces",
  ])("rejects malformed authorization %j without falling through to cookie claims", async (authorization) => {
    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(401);
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("revokes only for the authenticated user even when another user id is supplied", async () => {
    const response = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, user_id: USER_B_ID }),
    }), {} as never);

    expect(response.status).toBe(200);
    expect(database.rpc).toHaveBeenCalledWith("revoke_push_device_v2", {
      p_user_id: USER_A_ID,
      p_token: TOKEN,
      p_session_id: SESSION_A_ID,
    });
    expect(database.rpc).not.toHaveBeenCalledWith(
      "revoke_push_device_v2",
      expect.objectContaining({ p_user_id: USER_B_ID }),
    );
  });

  it("fails closed when the fenced RPC migration is missing", async () => {
    database.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } });

    const response = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    }), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "PUSH_SESSION_FENCE_UNAVAILABLE",
    });
    expect(database.rpc).toHaveBeenCalledOnce();
    expect(database.rpc).toHaveBeenCalledWith("revoke_push_device_v2", {
      p_user_id: USER_A_ID,
      p_token: TOKEN,
      p_session_id: SESSION_A_ID,
    });
  });

  it("ignores caller-supplied ownership fields and derives the fence from verified claims", async () => {
    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: TOKEN,
        platform: "ios",
        provider: "expo",
        user_id: USER_B_ID,
        session_id: SESSION_B_ID,
        session_created_at: "2099-01-01T00:00:00Z",
        iat: 4_102_444_800,
      }),
    }), {} as never);

    expect(response.status).toBe(200);
    expect(database.rpc).toHaveBeenCalledWith("upsert_push_device_v2", {
      p_user_id: USER_A_ID,
      p_token: TOKEN,
      p_platform: "ios",
      p_provider: "expo",
      p_session_id: SESSION_A_ID,
    });
  });

  it("keeps the same authenticated session fence across access-token refreshes", async () => {
    const requestBody = JSON.stringify({
      token: TOKEN,
      platform: "android",
      provider: "expo",
    });

    await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN_A}`,
        "content-type": "application/json",
      },
      body: requestBody,
    }), {} as never);
    auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: USER_A_ID, session_id: SESSION_A_ID, iat: 999 } },
      error: null,
    });
    await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN_A_REFRESHED}`,
        "content-type": "application/json",
      },
      body: requestBody,
    }), {} as never);

    expect(auth.getClaims).toHaveBeenNthCalledWith(1, ACCESS_TOKEN_A);
    expect(auth.getClaims).toHaveBeenNthCalledWith(2, ACCESS_TOKEN_A_REFRESHED);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(database.rpc).toHaveBeenNthCalledWith(1, "upsert_push_device_v2", expect.objectContaining({
      p_session_id: SESSION_A_ID,
    }));
    expect(database.rpc).toHaveBeenNthCalledWith(2, "upsert_push_device_v2", expect.objectContaining({
      p_session_id: SESSION_A_ID,
    }));
  });

  it("fails POST closed instead of falling back when the fenced RPC is unavailable", async () => {
    database.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } });

    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "PUSH_SESSION_FENCE_UNAVAILABLE",
    });
    expect(database.rpc).toHaveBeenCalledOnce();
    expect(database.rpc).toHaveBeenCalledWith("upsert_push_device_v2", expect.objectContaining({
      p_session_id: SESSION_A_ID,
    }));
  });

  it("rejects a verified claim whose subject does not match the authenticated user", async () => {
    auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: USER_B_ID, session_id: SESSION_B_ID, iat: 123 } },
      error: null,
    });

    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(401);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("rejects expired or otherwise invalid bearer claims without leaking the token", async () => {
    const rejectedToken = "sensitive.expired.token";
    auth.getClaims.mockResolvedValueOnce({
      data: { claims: null },
      error: { message: `invalid JWT ${rejectedToken}` },
    });

    const response = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${rejectedToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: TOKEN }),
    }), {} as never);
    const responseBody = await response.text();

    expect(response.status).toBe(401);
    expect(auth.getClaims).toHaveBeenCalledWith(rejectedToken);
    expect(responseBody).not.toContain(rejectedToken);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("maps a session rejected by auth.sessions to an authentication failure", async () => {
    database.rpc.mockResolvedValueOnce({ error: { code: "22023" } });

    const response = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    }), {} as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_AUTH_SESSION" });
  });

  it("fails closed before privileged RPC work when verified session claims are absent", async () => {
    auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: USER_A_ID, iat: 123 } },
      error: null,
    });

    const response = await DELETE(new Request("https://example.test/api/profile/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    }), {} as never);

    expect(response.status).toBe(401);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["negative", -1],
    ["fractional", 123.5],
    ["string", "123"],
  ])("rejects a %s verified iat claim", async (_label, iat) => {
    auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: USER_A_ID, session_id: SESSION_A_ID, iat } },
      error: null,
    });

    const response = await POST(new Request("https://example.test/api/profile/push-token", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN_A}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: TOKEN, platform: "ios", provider: "expo" }),
    }), {} as never);

    expect(response.status).toBe(401);
    expect(database.rpc).not.toHaveBeenCalled();
  });
});
