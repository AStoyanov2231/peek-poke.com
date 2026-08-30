import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageMutationResponseSchema } from "@peekpoke/shared";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PEER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THREAD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLIENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SUPABASE_ORIGIN = "https://project.supabase.co";
const OBJECT_STEM = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
const MESSAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CREATED_AT = "2026-08-07T12:00:00.000Z";

const database = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  exists: vi.fn(),
  rpc: vi.fn(),
}));

const boundaries = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  isBlocked: vi.fn(),
  isDeletedProfile: vi.fn(),
  verifyThreadMembership: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: USER_ID },
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { display_name: "Sender", username: "sender" },
                error: null,
              }),
            }),
          }),
        }),
      },
      params: { threadId: THREAD_ID },
    }),
  verifyThreadMembership: boundaries.verifyThreadMembership,
  isDeletedProfile: boundaries.isDeletedProfile,
  isBlocked: boundaries.isBlocked,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: boundaries.enforceRateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: database.rpc,
    storage: {
      from: () => ({
        createSignedUrl: database.createSignedUrl,
        exists: database.exists,
      }),
    },
  }),
}));

import { POST } from "@/app/api/dm/[threadId]/route";

function signedMediaUrl(
  ownerId = USER_ID,
  suffix = ".jpg",
  token = "main-token",
) {
  return `${SUPABASE_ORIGIN}/storage/v1/object/sign/media/${ownerId}/${OBJECT_STEM}${suffix}?token=${token}`;
}

function request(mediaUrl: string, thumbnailUrl?: string) {
  return POST(new Request(`http://localhost/api/dm/${THREAD_ID}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": CLIENT_ID,
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      content: "Photo",
      message_type: "image",
      media_url: mediaUrl,
      ...(thumbnailUrl === undefined ? {} : { media_thumbnail_url: thumbnailUrl }),
    }),
  }), {} as never);
}

function textRequest() {
  return POST(new Request(`http://localhost/api/dm/${THREAD_ID}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": CLIENT_ID,
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      content: "Hello",
      message_type: "text",
    }),
  }), {} as never);
}

function ingressRequest(
  body: unknown,
  idempotencyHeader: string | null = CLIENT_ID,
  rawBody = false,
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyHeader !== null) {
    headers.set("idempotency-key", idempotencyHeader);
  }
  return POST(new Request(`http://localhost/api/dm/${THREAD_ID}`, {
    method: "POST",
    headers,
    body: rawBody ? String(body) : JSON.stringify(body),
  }), {} as never);
}

function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE_ID,
    thread_id: THREAD_ID,
    sender_id: USER_ID,
    client_id: CLIENT_ID,
    sequence: 7,
    content: "Hello",
    message_type: "text",
    media_url: null,
    media_thumbnail_url: null,
    is_read: false,
    is_edited: false,
    is_deleted: false,
    created_at: CREATED_AT,
    reply_to_id: null,
    reply_to: null,
    sender: {
      id: USER_ID,
      username: "sender",
      display_name: "Sender",
      avatar_url: null,
      location_text: null,
      is_online: true,
      last_seen_at: CREATED_AT,
      private_profile_column: "must not leak",
    },
    ...overrides,
  };
}

function rpcMessageFromArgs(args: unknown) {
  const values = args as Record<string, unknown>;
  return rawMessage({
    client_id: values.p_client_id ?? null,
    content: values.p_content,
    message_type: values.p_message_type,
    media_url: values.p_media_url,
    media_thumbnail_url: values.p_media_thumbnail_url ?? null,
    reply_to_id: values.p_reply_to_id ?? null,
  });
}

function allowValidIngress() {
  boundaries.enforceRateLimit.mockResolvedValue(null);
  boundaries.isBlocked.mockResolvedValue(false);
  boundaries.isDeletedProfile.mockResolvedValue(false);
  boundaries.verifyThreadMembership.mockResolvedValue({
    id: THREAD_ID,
    participant_1_id: USER_ID,
    participant_2_id: PEER_ID,
  });
}

function expectNoPostValidationSideEffects() {
  expect(boundaries.enforceRateLimit).not.toHaveBeenCalled();
  expect(boundaries.verifyThreadMembership).not.toHaveBeenCalled();
  expect(boundaries.isDeletedProfile).not.toHaveBeenCalled();
  expect(boundaries.isBlocked).not.toHaveBeenCalled();
  expect(database.exists).not.toHaveBeenCalled();
  expect(database.rpc).not.toHaveBeenCalled();
}

describe("POST /api/dm/[threadId] ingress contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowValidIngress();
  });

  it.each([
    ["missing idempotency header", {
      body: { client_id: CLIENT_ID, content: "Hello" },
      header: null,
      expectedCode: "INVALID_IDEMPOTENCY_KEY",
      expectedStatus: 400,
    }],
    ["malformed idempotency header", {
      body: { client_id: CLIENT_ID, content: "Hello" },
      header: "short",
      expectedCode: "INVALID_IDEMPOTENCY_KEY",
      expectedStatus: 400,
    }],
    ["missing client_id", {
      body: { content: "Hello" },
      header: CLIENT_ID,
      expectedCode: "VALIDATION_ERROR",
      expectedStatus: 400,
    }],
    ["header/body mismatch", {
      body: { client_id: PEER_ID, content: "Hello" },
      header: CLIENT_ID,
      expectedCode: "INVALID_IDEMPOTENCY_KEY",
      expectedStatus: 400,
    }],
    ["extra field", {
      body: { client_id: CLIENT_ID, content: "Hello", private: "unexpected" },
      header: CLIENT_ID,
      expectedCode: "VALIDATION_ERROR",
      expectedStatus: 400,
    }],
    ["null reply", {
      body: { client_id: CLIENT_ID, content: "Hello", reply_to_id: null },
      header: CLIENT_ID,
      expectedCode: "VALIDATION_ERROR",
      expectedStatus: 400,
    }],
    ["null image thumbnail", {
      body: {
        client_id: CLIENT_ID,
        content: "Photo",
        message_type: "image",
        media_url: signedMediaUrl(),
        media_thumbnail_url: null,
      },
      header: CLIENT_ID,
      expectedCode: "VALIDATION_ERROR",
      expectedStatus: 400,
    }],
  ])("rejects %s before rate-limit or authorization work", async (_label, testCase) => {
    const response = await ingressRequest(testCase.body, testCase.header);

    expect(response.status).toBe(testCase.expectedStatus);
    await expect(response.json()).resolves.toMatchObject({ code: testCase.expectedCode });
    expectNoPostValidationSideEffects();
  });

  it("rejects malformed JSON before rate-limit or authorization work", async () => {
    const response = await ingressRequest("{", CLIENT_ID, true);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    expectNoPostValidationSideEffects();
  });

  it("rejects an oversized body before rate-limit or authorization work", async () => {
    const response = await ingressRequest({
      client_id: CLIENT_ID,
      content: "x".repeat(128 * 1024),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "REQUEST_BODY_TOO_LARGE" });
    expectNoPostValidationSideEffects();
  });
});

describe("POST /api/dm/[threadId] media contract", () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    allowValidIngress();
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    database.createSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `${SUPABASE_ORIGIN}/storage/v1/object/sign/media/${path}?token=response-token` },
      error: null,
    }));
    database.exists.mockResolvedValue({ data: true, error: null });
    database.rpc.mockImplementation(async (_name: string, args: unknown) => ({
      data: { message: rpcMessageFromArgs(args), deduplicated: false },
      error: null,
    }));
  });

  afterEach(() => {
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
  });

  it("accepts owner-bound main/thumbnail paths only when both exact Storage objects exist", async () => {
    const main = signedMediaUrl();
    const thumbnail = signedMediaUrl(USER_ID, "_thumb.webp", "thumb-token");

    const response = await request(main, thumbnail);

    expect(response.status).toBe(200);
    expect(database.exists.mock.calls).toEqual([
      [`${USER_ID}/${OBJECT_STEM}.jpg`],
      [`${USER_ID}/${OBJECT_STEM}_thumb.webp`],
    ]);
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc).toHaveBeenCalledWith("send_message_transactional", expect.objectContaining({
      p_sender_id: USER_ID,
      p_media_url: `${SUPABASE_ORIGIN}/storage/v1/object/public/media/${USER_ID}/${OBJECT_STEM}.jpg`,
      p_media_thumbnail_url: `${SUPABASE_ORIGIN}/storage/v1/object/public/media/${USER_ID}/${OBJECT_STEM}_thumb.webp`,
    }));
  });

  it("accepts the canonical native image payload when no thumbnail was uploaded", async () => {
    const response = await request(signedMediaUrl());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(messageMutationResponseSchema.parse(payload)).toEqual(payload);
    expect(database.exists).toHaveBeenCalledTimes(1);
    expect(database.rpc).toHaveBeenCalledWith("send_message_transactional", expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_media_thumbnail_url: null,
    }));
  });

  it.each([
    ["foreign owner", signedMediaUrl(PEER_ID)],
    ["encoded owner", signedMediaUrl().replace(`/${USER_ID}/`, "/%61aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/")],
    ["owner case variant", signedMediaUrl(USER_ID.toUpperCase())],
    ["object case variant", signedMediaUrl().replace("550e8400", "550E8400")],
    ["raw traversal", signedMediaUrl().replace(`${OBJECT_STEM}.jpg`, `ignored/../${OBJECT_STEM}.jpg`)],
    ["encoded traversal", signedMediaUrl().replace(`${OBJECT_STEM}.jpg`, `ignored/%2e%2e/${OBJECT_STEM}.jpg`)],
    ["double-encoded traversal", signedMediaUrl().replace(`${OBJECT_STEM}.jpg`, `ignored/%252e%252e%252f${OBJECT_STEM}.jpg`)],
    ["foreign origin", signedMediaUrl().replace(SUPABASE_ORIGIN, "https://other.supabase.co")],
    ["origin suffix attack", signedMediaUrl().replace(SUPABASE_ORIGIN, "https://project.supabase.co.evil.example")],
    ["public storage path", signedMediaUrl().replace("/sign/media/", "/public/media/")],
    ["extra path segment", signedMediaUrl().replace(`/${OBJECT_STEM}.jpg`, `/nested/${OBJECT_STEM}.jpg`)],
    ["main uses thumbnail name", signedMediaUrl(USER_ID, "_thumb.jpg")],
    ["unsupported extension", signedMediaUrl(USER_ID, ".jpeg")],
    ["missing token", signedMediaUrl().replace("?token=main-token", "")],
    ["blank token", signedMediaUrl(USER_ID, ".jpg", "")],
    ["duplicate token", `${signedMediaUrl()}&token=second-token`],
  ])("rejects a noncanonical %s without invoking the message RPC", async (_label, mediaUrl) => {
    const response = await request(mediaUrl);

    expect(response.status).toBe(400);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign thumbnail owner", signedMediaUrl(PEER_ID, "_thumb.webp", "thumb-token")],
    ["thumbnail without suffix", signedMediaUrl(USER_ID, ".webp", "thumb-token")],
    ["thumbnail stem mismatch", signedMediaUrl(USER_ID, "_thumb.webp", "thumb-token").replace(OBJECT_STEM, "1722501296790-550e8400-e29b-41d4-a716-446655440000")],
    ["thumbnail case variant", signedMediaUrl(USER_ID, "_THUMB.webp", "thumb-token")],
    ["encoded thumbnail path", signedMediaUrl(USER_ID, "_thumb.webp", "thumb-token").replace(`/${USER_ID}/`, `/%61${USER_ID.slice(1)}/`)],
  ])("rejects a malformed main/thumbnail pairing: %s", async (_label, thumbnailUrl) => {
    const response = await request(signedMediaUrl(), thumbnailUrl);

    expect(response.status).toBe(400);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("rejects a fabricated canonical path when the exact Storage object does not exist", async () => {
    const fabricatedStem = "1722501296790-550e8400-e29b-41d4-a716-446655440000";
    database.exists.mockResolvedValue({
      data: false,
      error: { status: 404, message: "Object not found" },
    });

    const response = await request(signedMediaUrl().replace(OBJECT_STEM, fabricatedStem));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "MESSAGE_SEND_FAILED",
      message: "Invalid media",
    });
    expect(database.exists).toHaveBeenCalledWith(`${USER_ID}/${fabricatedStem}.jpg`);
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when exact Storage object verification is unavailable", async () => {
    database.exists.mockRejectedValue(new Error("Storage provider unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(signedMediaUrl());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "MESSAGE_SEND_FAILED",
      message: "Message media temporarily unavailable",
    });
    expect(database.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/dm/[threadId] mutation response contract", () => {
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    allowValidIngress();
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    database.rpc.mockResolvedValue({
      data: { message: rawMessage(), deduplicated: false },
      error: null,
    });
  });

  afterEach(() => {
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
  });

  it.each([false, true])("returns the exact shared DTO for transactional deduplicated=%s", async (deduplicated) => {
    database.rpc.mockResolvedValue({
      data: { message: rawMessage(), deduplicated },
      error: null,
    });

    const response = await textRequest();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(messageMutationResponseSchema.parse(payload)).toEqual(payload);
    expect(Object.keys(payload)).toEqual(["message"]);
    expect(payload).not.toHaveProperty("deduplicated");
    expect(payload.message.sender).not.toHaveProperty("private_profile_column");
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc).toHaveBeenCalledWith(
      "send_message_transactional",
      expect.objectContaining({ p_client_id: CLIENT_ID }),
    );
  });

  it("fails closed with a retryable 503 when the migration-first transactional RPC is missing", async () => {
    database.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });

    const response = await textRequest();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(payload).toEqual({
      version: "v1",
      error: "Message sending temporarily unavailable",
      message: "Message sending temporarily unavailable",
      code: "MESSAGE_SEND_UNAVAILABLE",
      request_id: null,
    });
    expect(typeof payload.message).toBe("string");
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc.mock.calls[0][0]).toBe("send_message_transactional");
    expect(database.rpc.mock.calls.some(([name]) => name === "send_message")).toBe(false);
  });

  it.each([
    ["null", null],
    ["array", [rawMessage()]],
    ["missing message", { deduplicated: false }],
    ["missing deduplicated", { message: rawMessage() }],
    ["wrong deduplicated type", { message: rawMessage(), deduplicated: "false" }],
    ["extra top-level field", { message: rawMessage(), deduplicated: false, raw: "private" }],
    ["malformed message", { message: rawMessage({ id: "not-a-uuid" }), deduplicated: false }],
    ["wrong thread", { message: rawMessage({ thread_id: PEER_ID }), deduplicated: false }],
    ["wrong sender", { message: rawMessage({ sender_id: PEER_ID }), deduplicated: false }],
    ["wrong client", { message: rawMessage({ client_id: PEER_ID }), deduplicated: false }],
  ])("fails malformed transactional RPC result %s closed", async (_label, data) => {
    database.rpc.mockResolvedValue({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await textRequest();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      code: "MESSAGE_SEND_FAILED",
      message: "Internal server error",
    });
    expect(JSON.stringify(payload)).not.toContain("private");
  });

  it.each([
    ["unknown", { error: "RAW_DATABASE_ERROR" }],
    ["extra", { error: "BLOCKED", private: "database detail" }],
    ["wrong type", { error: 42 }],
  ])("fails malformed RPC error %s closed without leakage", async (_label, data) => {
    database.rpc.mockResolvedValue({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await textRequest();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({ code: "MESSAGE_SEND_FAILED" });
    expect(JSON.stringify(payload)).not.toContain("database detail");
    expect(JSON.stringify(payload)).not.toContain("RAW_DATABASE_ERROR");
  });

  it("maps a known RPC denial to a generic public error without echoing the raw value", async () => {
    database.rpc.mockResolvedValue({ data: { error: "BLOCKED" }, error: null });

    const response = await textRequest();
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      code: "MESSAGE_SEND_FAILED",
      message: "Cannot send message",
    });
    expect(JSON.stringify(payload)).not.toContain("BLOCKED");
  });

  it("maps an exclusive media-claim conflict to a stable non-retryable 409", async () => {
    database.rpc.mockResolvedValue({ data: { error: "MEDIA_ALREADY_CLAIMED" }, error: null });

    const response = await textRequest();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      version: "v1",
      error: "Message media was already used",
      message: "Message media was already used",
      code: "MESSAGE_MEDIA_ALREADY_CLAIMED",
      request_id: null,
    });
  });

  it("maps a changed same-key replay to the shared idempotency conflict", async () => {
    database.rpc.mockResolvedValue({ data: { error: "IDEMPOTENCY_KEY_REUSED" }, error: null });

    const response = await textRequest();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency key was already used for a different message",
    });
  });

  it("maps an RPC-level generation mismatch to a validation failure", async () => {
    database.rpc.mockResolvedValue({ data: { error: "INVALID_MEDIA" }, error: null });

    const response = await textRequest();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "MESSAGE_SEND_FAILED",
      message: "Invalid media",
    });
  });
});
