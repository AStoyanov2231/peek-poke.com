import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorEnvelopeSchema,
  friendshipCreateResponseSchema,
  friendshipRemovalResponseSchema,
  friendshipResponseSchema,
} from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const FRIENDSHIP_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "friend-mutation-000001";

const friendship = {
  id: FRIENDSHIP_ID,
  requester_id: USER_ID,
  addressee_id: PEER_ID,
  status: "pending",
  requested_at: "2026-08-07T10:00:00.000Z",
  responded_at: null,
};

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));
const enforceRateLimit = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) =>
      handler(request, {
        user: { id: USER_ID },
        supabase: {},
        params: routeContext?.params ? await routeContext.params : {},
      }),
  verifyFriendshipParticipant: vi.fn(async () => ({
    id: FRIENDSHIP_ID,
    requester_id: USER_ID,
    addressee_id: PEER_ID,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  notifyFriendshipChanged: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc, from: database.from }),
}));

import { POST } from "@/app/api/friends/route";
import { DELETE, PATCH } from "@/app/api/friends/[friendshipId]/route";
import { friendRequestHash } from "@/lib/friend-request-idempotency";

describe("friendship mutation route success contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockReset();
    database.from.mockReset();
    database.maybeSingle.mockReset();
    database.maybeSingle.mockResolvedValue({ data: null, error: null });
    enforceRateLimit.mockReset();
    enforceRateLimit.mockResolvedValue(null);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gt", "is", "order", "limit"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = database.maybeSingle;
    database.from.mockReturnValue(chain);
  });

  it("constructs the named POST DTO and echoes the idempotency header", async () => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { friendship, balance: 4 },
        replayed: false,
      },
      error: null,
    });
    database.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe(IDEMPOTENCY_KEY);
    expect(response.headers.get("x-idempotency-replayed")).toBe("false");
    expect(friendshipCreateResponseSchema.parse(await response.json())).toEqual({
      friendship,
      balance: 4,
    });
  });

  it("fails POST closed when the mapped success cannot satisfy the shared DTO", async () => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { friendship: { ...friendship, id: "not-a-uuid" }, balance: 4 },
        replayed: false,
      },
      error: null,
    });
    database.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
  });

  it("requires an idempotency key before executing POST", async () => {
    const response = await POST(new Request("https://example.test/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addressee_id: PEER_ID }),
    }), {} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("fails migration-first when the durable idempotency table is unavailable", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "table not found" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("replays the exact stored status/body without executing the RPC again", async () => {
    const responseBody = { friendship, balance: 4 };
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: friendRequestHash(USER_ID, { addressee_id: PEER_ID }),
        response_status: 200,
        response_body: responseBody,
      },
      error: null,
    });

    const response = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(response.json()).resolves.toEqual(responseBody);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("returns the same bounded bucket POST 429 without a per-key replay row", async () => {
    const responseBody = {
      version: "v1",
      error: "Too many requests",
      message: "Too many requests",
      code: "RATE_LIMITED",
      request_id: null,
    };
    database.rpc.mockResolvedValue({
      data: {
        response_status: 429,
        response_body: responseBody,
        retry_after_seconds: 37,
        replayed: false,
      },
      error: null,
    });

    const first = await POST(
      request("/api/friends", "POST", { addressee_id: PEER_ID }),
      {} as never,
    );
    const replay = await POST(
      request("/api/friends", "POST", { addressee_id: PEER_ID }),
      {} as never,
    );

    expect([first.status, replay.status]).toEqual([429, 429]);
    expect([first.headers.get("retry-after"), replay.headers.get("retry-after")])
      .toEqual(["37", "37"]);
    expect([
      first.headers.get("x-idempotency-replayed"),
      replay.headers.get("x-idempotency-replayed"),
    ]).toEqual(["false", "false"]);
    expect(apiErrorEnvelopeSchema.parse(await first.json())).toEqual(responseBody);
    expect(apiErrorEnvelopeSchema.parse(await replay.json())).toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("fails POST closed when a 429 omits its durable Retry-After", async () => {
    database.rpc.mockResolvedValueOnce({
      data: {
        response_status: 429,
        response_body: {
          version: "v1",
          error: "Too many requests",
          message: "Too many requests",
          code: "RATE_LIMITED",
          request_id: null,
        },
        retry_after_seconds: null,
        replayed: false,
      },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      request("/api/friends", "POST", { addressee_id: PEER_ID }),
      {} as never,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
  });

  it("recovers a committed transaction after the RPC response is lost", async () => {
    const responseBody = { friendship, balance: 4 };
    const requestHash = friendRequestHash(USER_ID, { addressee_id: PEER_ID });
    database.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          request_hash: requestHash,
          response_status: 200,
          response_body: responseBody,
        },
        error: null,
      });
    database.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST000", message: "connection closed after commit" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);
    const replay = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(first.status).toBe(503);
    await expect(first.json()).resolves.toMatchObject({
      code: "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(replay.json()).resolves.toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when the same key is reused for a different request hash", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: "f".repeat(64),
        response_status: 200,
        response_body: { friendship, balance: 4 },
      },
      error: null,
    });

    const response = await POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("sends concurrent same-key POST copies to the atomic RPC instead of returning 429", async () => {
    const responseBody = { friendship, balance: 4 };
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }) as never);
    database.rpc
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: true },
        error: null,
      });

    const [first, concurrentReplay] = await Promise.all([
      POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never),
      POST(request("/api/friends", "POST", { addressee_id: PEER_ID }), {} as never),
    ]);

    expect([first.status, concurrentReplay.status]).toEqual([200, 200]);
    expect([
      first.headers.get("x-idempotency-replayed"),
      concurrentReplay.headers.get("x-idempotency-replayed"),
    ]).toEqual(["false", "true"]);
    expect(await first.json()).toEqual(responseBody);
    expect(await concurrentReplay.json()).toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(database.rpc.mock.calls.map(([, args]) => args.p_idempotency_key))
      .toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY]);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("lets different POST keys reach transactional pending and coin constraints", async () => {
    const firstKey = "friend-create-key-different-0001";
    const secondKey = "friend-create-key-different-0002";
    database.rpc
      .mockResolvedValueOnce({
        data: {
          response_status: 200,
          response_body: { friendship, balance: 4 },
          replayed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          response_status: 409,
          response_body: {
            version: "v1",
            error: "Request already pending",
            message: "Request already pending",
            code: "ALREADY_PENDING",
            request_id: null,
          },
          replayed: false,
        },
        error: null,
      });

    const first = await POST(
      request("/api/friends", "POST", { addressee_id: PEER_ID }, firstKey),
      {} as never,
    );
    const constrained = await POST(
      request("/api/friends", "POST", { addressee_id: PEER_ID }, secondKey),
      {} as never,
    );

    expect(first.status).toBe(200);
    expect(constrained.status).toBe(409);
    await expect(constrained.json()).resolves.toMatchObject({ code: "ALREADY_PENDING" });
    expect(database.rpc.mock.calls.map(([, args]) => args.p_idempotency_key))
      .toEqual([firstKey, secondKey]);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("returns the accepted PATCH projection without the raw RPC row", async () => {
    const accepted = {
      ...friendship,
      requester_id: PEER_ID,
      addressee_id: USER_ID,
      status: "accepted",
      responded_at: "2026-08-07T10:01:00.000Z",
    };
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { status: "accepted", friendship: accepted },
        replayed: false,
      },
      error: null,
    });

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(response.headers.get("idempotency-key")).toBe(IDEMPOTENCY_KEY);
    expect(response.headers.get("x-idempotency-replayed")).toBe("false");
    expect(friendshipResponseSchema.parse(await response.json())).toEqual({
      status: "accepted",
      friendship: accepted,
    });
  });

  it("returns the declined PATCH projection without querying a deleted row", async () => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { status: "declined", friendship: null },
        replayed: false,
      },
      error: null,
    });

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "declined" }),
      context(),
    );

    expect(friendshipResponseSchema.parse(await response.json())).toEqual({
      status: "declined",
      friendship: null,
    });
    expect(database.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("fails accepted PATCH closed when the canonical friendship is not accepted", async () => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { status: "accepted", friendship },
        replayed: false,
      },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    });
  });

  it("requires a stable idempotency key before PATCH preflight", async () => {
    const response = await PATCH(new Request(
      `https://example.test/api/friends/${FRIENDSHIP_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      },
    ), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(database.from).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("replays a stored PATCH response before rate limiting or mutation", async () => {
    const accepted = {
      ...friendship,
      requester_id: PEER_ID,
      addressee_id: USER_ID,
      status: "accepted" as const,
      responded_at: "2026-08-07T10:01:00.000Z",
    };
    const body = { status: "accepted", friendship: accepted };
    const { friendResponseHash } = await import("@/lib/friend-response-idempotency");
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: friendResponseHash(USER_ID, FRIENDSHIP_ID, { status: "accepted" }),
        response_status: 200,
        response_body: body,
      },
      error: null,
    });

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(response.json()).resolves.toEqual(body);
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("returns deterministic 409 when a PATCH key is bound to another action", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: "f".repeat(64),
        response_status: 200,
        response_body: { status: "declined", friendship: null },
      },
      error: null,
    });

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("fails PATCH closed when durable idempotency is not deployed", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "table not found" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("recovers a committed PATCH after the RPC response is lost", async () => {
    const accepted = {
      ...friendship,
      requester_id: PEER_ID,
      addressee_id: USER_ID,
      status: "accepted" as const,
      responded_at: "2026-08-07T10:01:00.000Z",
    };
    const responseBody = { status: "accepted", friendship: accepted };
    const { friendResponseHash } = await import("@/lib/friend-response-idempotency");
    database.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          request_hash: friendResponseHash(USER_ID, FRIENDSHIP_ID, { status: "accepted" }),
          response_status: 200,
          response_body: responseBody,
        },
        error: null,
      });
    database.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST000", message: "connection closed after commit" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );
    const replay = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
      context(),
    );

    expect(first.status).toBe(503);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(replay.json()).resolves.toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });

  it("sends concurrent same-key PATCH copies to the atomic RPC instead of returning 429", async () => {
    const accepted = {
      ...friendship,
      requester_id: PEER_ID,
      addressee_id: USER_ID,
      status: "accepted" as const,
      responded_at: "2026-08-07T10:01:00.000Z",
    };
    const responseBody = { status: "accepted", friendship: accepted };
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }) as never);
    database.rpc
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: true },
        error: null,
      });

    const [first, concurrentReplay] = await Promise.all([
      PATCH(
        request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
        context(),
      ),
      PATCH(
        request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }),
        context(),
      ),
    ]);

    expect([first.status, concurrentReplay.status]).toEqual([200, 200]);
    expect([
      first.headers.get("x-idempotency-replayed"),
      concurrentReplay.headers.get("x-idempotency-replayed"),
    ]).toEqual(["false", "true"]);
    expect(await first.json()).toEqual(responseBody);
    expect(await concurrentReplay.json()).toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(database.rpc.mock.calls.map(([, args]) => args.p_idempotency_key))
      .toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY]);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("returns the same bounded bucket PATCH 429 without a per-key replay row", async () => {
    const requestBody = { status: "accepted" as const };
    const responseBody = {
      version: "v1",
      error: "Too many requests",
      message: "Too many requests",
      code: "RATE_LIMITED",
      request_id: null,
    };
    database.rpc.mockResolvedValue({
      data: {
        response_status: 429,
        response_body: responseBody,
        retry_after_seconds: 11,
        replayed: false,
      },
      error: null,
    });

    const first = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", requestBody),
      context(),
    );
    const replay = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", requestBody),
      context(),
    );

    expect([first.status, replay.status]).toEqual([429, 429]);
    expect([first.headers.get("retry-after"), replay.headers.get("retry-after")])
      .toEqual(["11", "11"]);
    expect([
      first.headers.get("x-idempotency-replayed"),
      replay.headers.get("x-idempotency-replayed"),
    ]).toEqual(["false", "false"]);
    expect(apiErrorEnvelopeSchema.parse(await first.json())).toEqual(responseBody);
    expect(apiErrorEnvelopeSchema.parse(await replay.json())).toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("lets different PATCH keys reach the serialized terminal-state constraint", async () => {
    const accepted = {
      ...friendship,
      requester_id: PEER_ID,
      addressee_id: USER_ID,
      status: "accepted" as const,
      responded_at: "2026-08-07T10:01:00.000Z",
    };
    const firstKey = "friend-response-key-different-01";
    const secondKey = "friend-response-key-different-02";
    database.rpc
      .mockResolvedValueOnce({
        data: {
          response_status: 200,
          response_body: { status: "accepted", friendship: accepted },
          replayed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          response_status: 409,
          response_body: {
            version: "v1",
            error: "Friend request was already responded to",
            message: "Friend request was already responded to",
            code: "FRIEND_REQUEST_ALREADY_RESPONDED",
            request_id: null,
          },
          replayed: false,
        },
        error: null,
      });

    const first = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }, firstKey),
      context(),
    );
    const constrained = await PATCH(
      request(`/api/friends/${FRIENDSHIP_ID}`, "PATCH", { status: "accepted" }, secondKey),
      context(),
    );

    expect(first.status).toBe(200);
    expect(constrained.status).toBe(409);
    await expect(constrained.json()).resolves.toMatchObject({
      code: "FRIEND_REQUEST_ALREADY_RESPONDED",
    });
    expect(database.rpc.mock.calls.map(([, args]) => args.p_idempotency_key))
      .toEqual([firstKey, secondKey]);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    [true, 5],
    [false, null],
  ])("returns the strict DELETE refund DTO (refunded=%s, balance=%s)", async (refunded, balance) => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { success: true, refunded, balance },
        replayed: false,
      },
      error: null,
    });

    const response = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(response.headers.get("idempotency-key")).toBe(IDEMPOTENCY_KEY);
    expect(response.headers.get("x-idempotency-replayed")).toBe("false");
    expect(friendshipRemovalResponseSchema.parse(await response.json())).toEqual({
      success: true,
      refunded,
      balance,
    });
  });

  it("fails DELETE closed when the RPC success has a malformed refund flag", async () => {
    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { success: true, refunded: "yes", balance: null },
        replayed: false,
      },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    });
  });

  it("requires a stable idempotency key before DELETE preflight", async () => {
    const response = await DELETE(new Request(
      `https://example.test/api/friends/${FRIENDSHIP_ID}`,
      { method: "DELETE" },
    ), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("replays the exact stored DELETE response without mutating again", async () => {
    const responseBody = { success: true, refunded: true, balance: 5 };
    const { friendRemovalHash } = await import("@/lib/friend-removal-idempotency");
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: friendRemovalHash(USER_ID, FRIENDSHIP_ID),
        response_status: 200,
        response_body: responseBody,
      },
      error: null,
    });

    const response = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(response.json()).resolves.toEqual(responseBody);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("returns 409 when a DELETE key is bound to another friendship", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: {
        request_hash: "f".repeat(64),
        response_status: 200,
        response_body: { success: true, refunded: false, balance: null },
      },
      error: null,
    });

    const response = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("fails DELETE migration-first when durable idempotency is unavailable", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "table not found" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      code: "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("recovers a committed DELETE after the RPC response is lost", async () => {
    const responseBody = { success: true, refunded: true, balance: 5 };
    const { friendRemovalHash } = await import("@/lib/friend-removal-idempotency");
    database.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          request_hash: friendRemovalHash(USER_ID, FRIENDSHIP_ID),
          response_status: 200,
          response_body: responseBody,
        },
        error: null,
      });
    database.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST000", message: "connection closed after commit" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );
    const replay = await DELETE(
      request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"),
      context(),
    );

    expect(first.status).toBe(503);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(replay.json()).resolves.toEqual(responseBody);
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });

  it("lets concurrent same-key DELETE copies reach the atomic RPC", async () => {
    const responseBody = { success: true, refunded: true, balance: 5 };
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }) as never);
    database.rpc
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { response_status: 200, response_body: responseBody, replayed: true },
        error: null,
      });

    const [first, replay] = await Promise.all([
      DELETE(request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"), context()),
      DELETE(request(`/api/friends/${FRIENDSHIP_ID}`, "DELETE"), context()),
    ]);

    expect([first.status, replay.status]).toEqual([200, 200]);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    expect(database.rpc.mock.calls.map(([, args]) => args.p_idempotency_key))
      .toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY]);
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
});

function request(path: string, method: string, body?: unknown, key = IDEMPOTENCY_KEY) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ friendshipId: FRIENDSHIP_ID }) } as never;
}
