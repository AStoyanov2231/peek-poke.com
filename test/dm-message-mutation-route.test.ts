import { beforeEach, describe, expect, it, vi } from "vitest";
import { contractFixtureMessage, messageMutationResponseSchema } from "@peekpoke/shared";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

const database = vi.hoisted(() => ({
  existing: null as unknown,
  existingError: null as unknown,
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: ACTOR },
      params: { threadId: THREAD, messageId: MESSAGE },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => database,
}));

import { DELETE, PATCH } from "@/app/api/dm/[threadId]/[messageId]/route";

function responseMessage(action: "edit" | "delete", content = "changed") {
  return {
    ...contractFixtureMessage,
    id: MESSAGE,
    thread_id: THREAD,
    sender_id: ACTOR,
    content: action === "edit" ? content : null,
    media_url: null,
    media_thumbnail_url: null,
    is_edited: action === "edit",
    is_deleted: action === "delete",
  };
}

function request(
  method: "PATCH" | "DELETE",
  options: { key?: string | null; body?: unknown; rawBody?: string } = {},
) {
  const headers = new Headers();
  if (options.key !== null) headers.set("idempotency-key", options.key ?? KEY);
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost/api/dm/${THREAD}/${MESSAGE}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
}

function configurePreflight() {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: database.existing,
      error: database.existingError,
    })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  database.from.mockReturnValue(chain);
}

describe("DM message mutation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.existing = null;
    database.existingError = null;
    configurePreflight();
  });

  it.each([
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)("requires an idempotency key for %s before database work", async (method, handler) => {
    const response = await handler(request(method, {
      key: null,
      ...(method === "PATCH" ? { body: { content: "changed" } } : {}),
    }), {} as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("applies one strict normalized edit through the atomic RPC", async () => {
    const body = { message: responseMessage("edit") };
    database.rpc.mockResolvedValue({
      data: { response_status: 200, response_body: body, replayed: false },
      error: null,
    });

    const response = await PATCH(request("PATCH", { body: { content: "  changed  " } }), {} as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe(KEY);
    expect(response.headers.get("x-idempotency-replayed")).toBe("false");
    expect(messageMutationResponseSchema.parse(payload)).toEqual(payload);
    expect(database.rpc).toHaveBeenCalledWith("mutate_dm_message_idempotent", expect.objectContaining({
      p_actor_id: ACTOR,
      p_thread_id: THREAD,
      p_message_id: MESSAGE,
      p_action: "edit",
      p_content: "changed",
      p_operation: "dm_message:edit",
      p_idempotency_key: KEY,
      p_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("replays the stored result before invoking the RPC", async () => {
    const firstBody = { message: responseMessage("delete") };
    database.rpc.mockResolvedValue({
      data: { response_status: 200, response_body: firstBody, replayed: false },
      error: null,
    });
    const first = await DELETE(request("DELETE"), {} as never);
    expect(first.status).toBe(200);
    const requestHash = database.rpc.mock.calls[0][1].p_request_hash;

    database.rpc.mockClear();
    database.existing = {
      request_hash: requestHash,
      response_status: 200,
      response_body: firstBody,
    };
    const replay = await DELETE(request("DELETE"), {} as never);

    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotency-replayed")).toBe("true");
    await expect(replay.json()).resolves.toEqual(firstBody);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("rejects same-key payload conflicts with 409", async () => {
    database.existing = {
      request_hash: "a".repeat(64),
      response_status: 200,
      response_body: { message: responseMessage("edit", "other") },
    };

    const response = await PATCH(request("PATCH", { body: { content: "changed" } }), {} as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("rejects DELETE bodies and invalid stored/RPC DTOs fail closed", async () => {
    const withBody = await DELETE(request("DELETE", {
      body: {
        media_url: `https://project.supabase.co/storage/v1/object/public/media/${ACTOR}/1722501296790-660e8400-e29b-41d4-a716-446655440000.jpg`,
      },
    }), {} as never);
    expect(withBody.status).toBe(400);
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();

    database.rpc.mockResolvedValue({
      data: {
        response_status: 200,
        response_body: { message: { ...responseMessage("delete"), thread_id: ACTOR } },
        replayed: false,
      },
      error: null,
    });
    const malformed = await DELETE(request("DELETE"), {} as never);
    expect(malformed.status).toBe(503);
    await expect(malformed.json()).resolves.toMatchObject({
      code: "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
    });
  });
});
