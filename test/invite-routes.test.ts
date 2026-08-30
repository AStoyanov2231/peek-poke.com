import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const INVITER_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const database = vi.hoisted(() => ({
  authenticated: true,
  rpc: vi.fn(),
  limited: null as Response | null,
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<{ inviterId: string }> }) =>
      database.authenticated
        ? handler(request, {
          user: { id: VIEWER_ID },
          supabase: {},
          params: routeContext?.params ? await routeContext.params : {},
        })
        : Response.json({
          version: "v1",
          error: "Unauthorized",
          message: "Unauthorized",
          code: "UNAUTHORIZED",
          request_id: "invite-auth-request",
        }, {
          status: 401,
          headers: { "x-request-id": "invite-auth-request", "x-auth-boundary": "preserved" },
        }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => database.limited),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

import { GET } from "@/app/api/invites/route";
import { POST } from "@/app/api/invites/[inviterId]/route";
import { createInviteToken } from "@/lib/invite-token";

describe("invite routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.authenticated = true;
    database.limited = null;
    database.rpc.mockResolvedValue({ data: undefined, error: null });
    process.env.SUPABASE_SERVICE_ROLE_KEY = "route-test-service-role";
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("returns an exact configured invite URL without caching or request-origin influence", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.peek-poke.com";
    const response = await GET(new Request("https://evil-request-origin.example/api/invites"), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ invite_url: expect.stringMatching(
      new RegExp(`^https://www\\.peek-poke\\.com/invite/v1\\.${VIEWER_ID}\\.`),
    ) });
    expect(payload.invite_url).not.toContain("evil-request-origin.example");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
  ])("fails %s NEXT_PUBLIC_APP_URL closed without deriving from the request", async (_kind, origin) => {
    if (origin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = origin;

    const response = await GET(new Request("https://evil-request-origin.example/api/invites"), {} as never);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ code: "INVITE_UNAVAILABLE" });
    expect(payload).not.toHaveProperty("invite_url");
    expect(serialized).not.toContain("evil-request-origin.example");
    expect(serialized).not.toContain("/invite/");
    expect(serialized).not.toContain(VIEWER_ID);
  });

  it.each([
    "https://invites.peek-poke.com",
    "https://invites.peek-poke.com/",
  ])("accepts the canonical configured root %s", async (configuredOrigin) => {
    process.env.NEXT_PUBLIC_APP_URL = configuredOrigin;

    const response = await GET(new Request("https://request-origin.example/api/invites"), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.invite_url).toMatch(
      new RegExp(`^https://invites\\.peek-poke\\.com/invite/v1\\.${VIEWER_ID}\\.`),
    );
    expect(payload.invite_url).not.toContain("request-origin.example");
  });

  it.each([
    ["missing signing config", undefined, "https://www.peek-poke.com"],
    ["invalid configured origin", "route-test-service-role", "not a URL"],
  ])("fails %s closed with the canonical response", async (_kind, key, origin) => {
    if (key) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_APP_URL = origin;

    const response = await GET(new Request("https://www.peek-poke.com/api/invites"), {} as never);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "INVITE_UNAVAILABLE" });
  });

  it.each([
    ["credentials", "https://user:password@invites.peek-poke.com"],
    ["path", "https://invites.peek-poke.com/redirect"],
    ["query", "https://invites.peek-poke.com?next=https://evil.example"],
    ["fragment", "https://invites.peek-poke.com#invite"],
    [
      "combined smuggling",
      "https://user:password@invites.peek-poke.com/redirect?next=https://evil.example#invite",
    ],
  ])("fails configured-origin %s closed without leaking a token or link", async (_kind, origin) => {
    process.env.NEXT_PUBLIC_APP_URL = origin;

    const response = await GET(new Request("https://request-origin.example/api/invites"), {} as never);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      code: "INVITE_UNAVAILABLE",
      message: "Invite links are unavailable",
    });
    expect(payload).not.toHaveProperty("invite_url");
    expect(serialized).not.toContain("/invite/");
    expect(serialized).not.toContain(VIEWER_ID);
  });

  it.each([
    ["public host in development", "development", "http://www.peek-poke.com"],
    ["loopback in production", "production", "http://127.0.0.1:3000"],
    ["LAN host in development", "development", "http://192.168.1.20:3000"],
  ])("fails HTTP %s closed without leaking a token", async (_kind, mode, origin) => {
    process.env.NODE_ENV = mode;
    process.env.NEXT_PUBLIC_APP_URL = origin;

    const response = await GET(new Request("https://request-origin.example/api/invites"), {} as never);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ code: "INVITE_UNAVAILABLE" });
    expect(payload).not.toHaveProperty("invite_url");
    expect(serialized).not.toContain("/invite/");
    expect(serialized).not.toContain(VIEWER_ID);
  });

  it("accepts a configured development loopback HTTP origin", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";

    const response = await GET(new Request("https://request-origin.example/api/invites"), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.invite_url).toMatch(
      new RegExp(`^http://127\\.0\\.0\\.1:3000/invite/v1\\.${VIEWER_ID}\\.`),
    );
  });

  it("maps self without rate limiting or RPC and other through the void RPC", async () => {
    const selfToken = createInviteToken(VIEWER_ID);
    const self = await post(selfToken);
    expect(await self.json()).toEqual({ profile_id: VIEWER_ID });
    expect(self.headers.get("cache-control")).toBe("no-store");
    expect(database.rpc).not.toHaveBeenCalled();

    const otherToken = createInviteToken(INVITER_ID);
    const other = await post(otherToken);
    expect(await other.json()).toEqual({ profile_id: INVITER_ID });
    expect(other.headers.get("cache-control")).toBe("no-store");
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc).toHaveBeenCalledWith("accept_invite_link_for_user", {
      p_user_id: VIEWER_ID,
      p_inviter_id: INVITER_ID,
    });
  });

  it("preserves invalid-token, rate-limit, and RPC failures", async () => {
    const invalid = await post("not-a-token");
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    await expect(invalid.json()).resolves.toMatchObject({ code: "INVALID_INVITE" });

    database.limited = Response.json({ code: "RATE_LIMITED" }, {
      status: 429,
      headers: {
        "retry-after": "17",
        "x-request-id": "invite-rate-request",
        "x-rate-limit-source": "preserved",
      },
    });
    const limited = await post(createInviteToken(INVITER_ID));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(limited.headers.get("retry-after")).toBe("17");
    expect(limited.headers.get("x-request-id")).toBe("invite-rate-request");
    expect(limited.headers.get("x-rate-limit-source")).toBe("preserved");
    await expect(limited.json()).resolves.toEqual({ code: "RATE_LIMITED" });

    database.limited = null;
    database.rpc.mockResolvedValue({ data: undefined, error: { message: "database unavailable" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await post(createInviteToken(INVITER_ID));
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    await expect(failed.json()).resolves.toMatchObject({ code: "INVITE_ACCEPT_FAILED" });
  });

  it("adds no-store to GET and POST auth failures without replacing auth headers", async () => {
    database.authenticated = false;

    const getResponse = await GET(
      new Request("https://evil-request-origin.example/api/invites"),
      {} as never,
    );
    const postResponse = await post("not-a-token");

    for (const response of [getResponse, postResponse]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBe("invite-auth-request");
      expect(response.headers.get("x-auth-boundary")).toBe("preserved");
      await expect(response.json()).resolves.toMatchObject({
        code: "UNAUTHORIZED",
        request_id: "invite-auth-request",
      });
    }
  });
});

function post(token: string) {
  return POST(new Request(`https://www.peek-poke.com/api/invites/${token}`, { method: "POST" }), {
    params: Promise.resolve({ inviterId: token }),
  });
}
