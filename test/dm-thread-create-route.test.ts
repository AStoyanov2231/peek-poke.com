import { beforeEach, describe, expect, it, vi } from "vitest";
import { dmThreadCreateResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";

const database = vi.hoisted(() => ({
  blocked: false,
  from: vi.fn(),
  rpc: vi.fn(),
  target: { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null } as {
    data: unknown;
    error: unknown;
  },
  thread: { data: null, error: null } as { data: unknown; error: unknown },
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: USER_ID },
      supabase: {},
    }),
  isBlocked: vi.fn(async () => database.blocked),
  getBlockedPeerIds: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: database.rpc,
    from: database.from,
  }),
}));

import { POST } from "@/app/api/dm/threads/route";

const thread = {
  id: THREAD_ID,
  participant_1_id: USER_ID,
  participant_2_id: PEER_ID,
  last_message_at: null,
  last_message_preview: null,
  created_at: "2026-08-07T10:00:00.000Z",
  participant_1: {
    id: USER_ID,
    username: "viewer",
    display_name: "Viewer",
    avatar_url: null,
    location_text: null,
    is_online: true,
    last_seen_at: "2026-08-07T09:59:00.000Z",
  },
  participant_2: {
    id: PEER_ID,
    username: "peer",
    display_name: null,
    avatar_url: null,
    location_text: "Sofia",
    is_online: false,
    last_seen_at: null,
  },
};

function request(body: unknown = { user_id: PEER_ID }) {
  return POST(new Request("http://localhost/api/dm/threads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "thread-create-key-000001",
    },
    body: JSON.stringify(body),
  }), {} as never);
}

describe("POST /api/dm/threads contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.blocked = false;
    database.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => table === "profiles"
          ? { is: () => ({ maybeSingle: async () => database.target }) }
          : { maybeSingle: async () => database.thread },
      }),
    }));
    database.target = { data: { id: PEER_ID }, error: null };
    database.thread = { data: thread, error: null };
    database.rpc.mockResolvedValue({
      data: { id: THREAD_ID, thread_id: THREAD_ID, is_new: true, balance: 4 },
      error: null,
    });
  });

  it.each([true, false])("returns one exact canonical DTO when is_new=%s", async (isNew) => {
    database.rpc.mockResolvedValue({
      data: { id: THREAD_ID, thread_id: THREAD_ID, is_new: isNew, balance: 4 },
      error: null,
    });
    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dmThreadCreateResponseSchema.parse(payload)).toEqual(payload);
    expect(payload).toEqual({ id: THREAD_ID, is_new: isNew, balance: 4, thread: {
      ...thread,
      unread_count: 0,
    } });
    expect(response.headers.get("idempotency-key")).toBe("thread-create-key-000001");
  });

  it.each([
    ["extra", { id: THREAD_ID, thread_id: THREAD_ID, is_new: true, balance: 4, raw: true }],
    ["missing", { id: THREAD_ID, thread_id: THREAD_ID, is_new: true }],
    ["type", { id: THREAD_ID, thread_id: THREAD_ID, is_new: "yes", balance: 4 }],
    ["semantic", { id: THREAD_ID, thread_id: THREAD_ID, is_new: true, balance: -1 }],
    ["ID mismatch", { id: THREAD_ID, thread_id: PEER_ID, is_new: true, balance: 4 }],
  ])("fails malformed raw RPC %s success closed", async (_kind, data) => {
    database.rpc.mockResolvedValue({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "THREAD_CREATE_FAILED",
      message: "Internal server error",
    });
  });

  it.each([
    ["SELF_MESSAGE", 400, "SELF_MESSAGE"],
    ["USER_NOT_FOUND", 404, "USER_NOT_FOUND"],
    ["BLOCKED", 404, "USER_NOT_FOUND"],
    ["INSUFFICIENT_COINS", 403, "INSUFFICIENT_COINS"],
  ])("maps %s without leaking the raw RPC error", async (code, status, publicCode) => {
    database.rpc.mockResolvedValue({
      data: { error: code, message: "private database detail", status },
      error: null,
    });

    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(status);
    expect(payload.code).toBe(publicCode);
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });

  it.each([
    ["unknown", { error: "RAW_DATABASE_ERROR", message: "private database detail", status: 400 }],
    ["extra", { error: "BLOCKED", message: "private database detail", status: 404, raw: true }],
    ["wrong status", { error: "BLOCKED", message: "private database detail", status: 400 }],
    ["wrong deletion status", { error: "ACCOUNT_DELETED", message: "private database detail", status: 403 }],
  ])("fails malformed RPC error %s closed without leakage", async (_kind, data) => {
    database.rpc.mockResolvedValue({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe("THREAD_CREATE_FAILED");
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });

  it.each([
    ["missing", { data: null, error: null }],
    ["error", { data: null, error: { message: "private requery error" } }],
  ])("fails closed when the thread requery is %s", async (_kind, result) => {
    database.thread = result;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREAD_CREATE_FAILED" });
  });

  it.each([
    ["username", { ...thread, participant_1: { ...thread.participant_1, username: "" } }],
    ["is_online", { ...thread, participant_1: { ...thread.participant_1, is_online: "yes" } }],
    ["created_at", { ...thread, created_at: "not-a-timestamp" }],
    ["extra field", { ...thread, private_column: "leak" }],
    ["missing participant_1 profile", (() => {
      const { participant_1: _participant, ...missing } = thread;
      return missing;
    })()],
    ["missing participant_2 profile", (() => {
      const { participant_2: _participant, ...missing } = thread;
      return missing;
    })()],
    ["null", null],
    ["array", [thread]],
    ["participant roles", {
      ...thread,
      participant_1: { ...thread.participant_1, roles: ["user"] },
    }],
    ["participant account_deleted", {
      ...thread,
      participant_2: { ...thread.participant_2, account_deleted: true },
    }],
  ])("fails malformed raw requery row %s before mapping", async (_kind, data) => {
    database.thread = { data, error: null };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      version: "v1",
      error: "Internal server error",
      message: "Internal server error",
      code: "THREAD_CREATE_FAILED",
      request_id: null,
    });
  });

  it("fails closed when requery participants do not match the logical action", async () => {
    database.thread = {
      data: {
        ...thread,
        participant_2_id: "44444444-4444-4444-8444-444444444444",
      },
      error: null,
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREAD_CREATE_FAILED" });
  });

  it("fails closed when a nested participant profile ID does not match its thread field", async () => {
    database.thread = {
      data: {
        ...thread,
        participant_1: {
          id: PEER_ID,
          username: "mismatch",
          display_name: null,
          avatar_url: null,
          location_text: null,
          is_online: false,
          last_seen_at: null,
        },
      },
      error: null,
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREAD_CREATE_FAILED" });
  });

  it("rejects request extras before the RPC", async () => {
    const response = await request({ user_id: PEER_ID, raw: true });
    expect(response.status).toBe(400);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("preserves the explicit self-message envelope without target or RPC work", async () => {
    const response = await request({ user_id: USER_ID });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      version: "v1",
      error: "Cannot message yourself",
      message: "Cannot message yourself",
      code: "THREAD_CREATE_FAILED",
      request_id: null,
    });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it.each([404, 410])("conceals ACCOUNT_DELETED status %s like blocked and missing targets", async (deletedStatus) => {
    database.blocked = true;
    const blockedResponse = await request();
    const blockedBody = await blockedResponse.json();
    expect(database.rpc).not.toHaveBeenCalled();

    database.blocked = false;
    database.target = { data: null, error: null };
    const missingResponse = await request();
    const missingBody = await missingResponse.json();

    expect(database.rpc).not.toHaveBeenCalled();
    expect(blockedResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect(blockedBody).toEqual(missingBody);

    database.target = { data: { id: PEER_ID }, error: null };
    database.rpc.mockResolvedValue({
      data: {
        error: "ACCOUNT_DELETED",
        message: "private deletion detail",
        status: deletedStatus,
      },
      error: null,
    });
    const deletedResponse = await request();
    const deletedBody = await deletedResponse.json();

    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(deletedResponse.status).toBe(404);
    expect(deletedBody).toEqual(blockedBody);
    expect(deletedBody).toEqual({
      version: "v1",
      error: "User not found",
      message: "User not found",
      code: "USER_NOT_FOUND",
      request_id: null,
    });
    expect(JSON.stringify(deletedBody)).not.toContain("ACCOUNT_DELETED");
    expect(JSON.stringify(deletedBody)).not.toContain("private deletion detail");
  });
});
