import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockUserHash, USER_BLOCK_OPERATION } from "@/lib/block-user-idempotency";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const KEY = "block-idempotency-key-000001";
const rpc = vi.hoisted(() => vi.fn());
const preflight = vi.hoisted(() => vi.fn());
const enforceRateLimit = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) =>
      handler(request, {
        user: { id: USER_ID },
        supabase: {},
        params: routeContext?.params ? await routeContext.params : {},
      }),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc,
    from: () => {
      const chain = {
        select: vi.fn(),
        eq: vi.fn(),
        gt: vi.fn(),
        maybeSingle: preflight,
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.gt.mockReturnValue(chain);
      return chain;
    },
  }),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  notifyFriendshipChanged: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/users/[userId]/block/route";

function request(key = KEY, peerId = PEER_ID) {
  return new Request(`https://example.test/api/users/${peerId}/block`, {
    method: "POST",
    headers: { "idempotency-key": key },
  });
}

function context(peerId = PEER_ID) {
  return { params: Promise.resolve({ userId: peerId }) } as never;
}

describe("idempotent block route and friendship-refund fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preflight.mockResolvedValue({ data: null, error: null });
  });

  it("requires a stable idempotency key before any database mutation", async () => {
    const response = await POST(
      new Request(`https://example.test/api/users/${PEER_ID}/block`, { method: "POST" }),
      context(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(preflight).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("calls only the durable block RPC with the authenticated actor and canonical hash", async () => {
    rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { success: true, refunded: true, balance: 5 },
        retry_after_seconds: null,
        replayed: false,
      },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe(KEY);
    expect(response.headers.get("x-idempotency-replayed")).toBe("false");
    await expect(response.json()).resolves.toEqual({ success: true, refunded: true, balance: 5 });
    expect(rpc).toHaveBeenCalledWith("block_user_idempotent", {
      p_actor_id: USER_ID,
      p_blocked_id: PEER_ID,
      p_operation: USER_BLOCK_OPERATION,
      p_idempotency_key: KEY,
      p_request_hash: blockUserHash(USER_ID, PEER_ID),
      p_request_id: null,
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("returns only a neutral DTO when the blocker is not the refund owner", async () => {
    rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { success: true, refunded: false, balance: null },
        retry_after_seconds: null,
        replayed: false,
      },
      error: null,
    });

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, refunded: false, balance: null });
    expect(Object.keys(body).sort()).toEqual(["balance", "refunded", "success"]);
    expect(body).not.toHaveProperty("requester_id");
    expect(body).not.toHaveProperty("refund_owner_id");
    expect(body).not.toHaveProperty("amount");
  });

  it("replays the exact stored refund response without re-running the RPC", async () => {
    preflight.mockResolvedValue({
      data: {
        request_hash: blockUserHash(USER_ID, PEER_ID),
        response_status: 200,
        response_body: { success: true, refunded: true, balance: 5 },
        response_retry_after_seconds: null,
      },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(response.json()).resolves.toEqual({ success: true, refunded: true, balance: 5 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a same-key target/hash collision before mutation", async () => {
    preflight.mockResolvedValue({
      data: {
        request_hash: blockUserHash(USER_ID, OTHER_ID),
        response_status: 200,
        response_body: { success: true, refunded: false, balance: null },
        response_retry_after_seconds: null,
      },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets concurrent same-key callers reach the atomic claim without an app limiter", async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          response_status: 200,
          response_body: { success: true, refunded: true, balance: 5 },
          retry_after_seconds: null,
          replayed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          response_status: 200,
          response_body: { success: true, refunded: true, balance: 5 },
          retry_after_seconds: null,
          replayed: true,
        },
        error: null,
      });

    const responses = await Promise.all([POST(request(), context()), POST(request(), context())]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    await expect(Promise.all(responses.map((response) => response.json()))).resolves.toEqual([
      { success: true, refunded: true, balance: 5 },
      { success: true, refunded: true, balance: 5 },
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("preserves an exact stored 429 and Retry-After boundary response", async () => {
    preflight.mockResolvedValue({
      data: {
        request_hash: blockUserHash(USER_ID, PEER_ID),
        response_status: 429,
        response_body: {
          version: "v1",
          error: "Too many block requests",
          message: "Too many block requests",
          code: "RATE_LIMITED",
          request_id: "request-429",
        },
        response_retry_after_seconds: 86_400,
      },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("86400");
    expect(response.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(response.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the atomic limiter's first 429 with its exact Retry-After", async () => {
    rpc.mockResolvedValue({
      data: {
        response_status: 429,
        response_body: {
          version: "v1",
          error: "Too many block requests",
          message: "Too many block requests",
          code: "RATE_LIMITED",
          request_id: null,
        },
        retry_after_seconds: 12_345,
        replayed: false,
      },
      error: null,
    });

    const first = await POST(request(), context());
    const sameUnclaimedKey = await POST(request(), context());

    expect(first.status).toBe(429);
    expect(first.headers.get("retry-after")).toBe("12345");
    expect(first.headers.get("x-idempotency-replayed")).toBe("false");
    expect(sameUnclaimedKey.headers.get("retry-after")).toBe("12345");
    expect(sameUnclaimedKey.headers.get("x-idempotency-replayed")).toBe("false");
    const bodies = await Promise.all([first.json(), sameUnclaimedKey.json()]);
    expect(bodies[0]).toMatchObject({
      code: "RATE_LIMITED",
      request_id: null,
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the idempotency migration is unavailable", async () => {
    preflight.mockResolvedValue({ data: null, error: { code: "42P01" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      code: "BLOCK_IDEMPOTENCY_UNAVAILABLE",
      message: "Block service temporarily unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
