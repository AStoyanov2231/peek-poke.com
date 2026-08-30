import { describe, expect, it, vi } from "vitest";
import {
  contractFixtureFriend,
  contractFixtureBootstrap,
  contractFixtureError,
  contractFixtureMessage,
  contractFixturePage,
  contractFixtureReport,
  contractFixtureThread,
  contractFixtureProfile,
  decodeCursor,
  encodeCursor,
  friendSchema,
  messageSchema,
  messageMutationResponseSchema,
  chatMediaUploadResponseSchema,
  chatMediaUploadResponseSchemaFor,
  messagesResponseSchema,
  messageCreateSchema,
  messageHintHasGap,
  messageHintNeedsBackfill,
  messageHintSchema,
  pageSchema,
  bootstrapSchema,
  profileCardSchema,
  threadSummarySchema,
  paginateCursor,
  API_VERSION,
  endpointContracts,
  parseContractPayload,
  apiErrorEnvelopeSchema,
  moderationReportMutationResponseSchema,
  moderationReportMutationResponseSchemaFor,
  moderationReportsResponseSchema,
} from "@peekpoke/shared";
import { cursorPage, idempotencyKey, mapFriend, mapMessage, mapModerationReport } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { withRequestContext } from "@/lib/request-context";

describe("shared API contract", () => {
  it("validates the same canonical fixtures for web and native consumers", () => {
    expect(bootstrapSchema.parse(contractFixtureBootstrap)).toEqual(contractFixtureBootstrap);
    expect(profileCardSchema.parse(contractFixtureProfile)).toEqual(contractFixtureProfile);
    expect(friendSchema.parse(contractFixtureFriend)).toEqual(contractFixtureFriend);
    expect(threadSummarySchema.parse(contractFixtureThread)).toEqual(contractFixtureThread);
    expect(messageSchema.parse(contractFixtureMessage)).toEqual(contractFixtureMessage);
    expect(pageSchema(threadSummarySchema).parse(contractFixturePage)).toEqual(contractFixturePage);
    expect(contractFixtureError).toMatchObject({ version: API_VERSION, code: "INVALID_CURSOR" });
  });

  it("uses opaque versioned cursors with stable tuple ordering", () => {
    const cursor = encodeCursor({ sort_value: "2026-01-01T00:00:00.000Z", id: "b" });
    expect(cursor.startsWith(`${API_VERSION}.`)).toBe(true);
    expect(decodeCursor(cursor)).toEqual({
      version: API_VERSION,
      sort_value: "2026-01-01T00:00:00.000Z",
      id: "b",
    });

    const values = [
      { id: "a", sort_value: "2026-01-01T00:00:00.000Z" },
      { id: "b", sort_value: "2026-01-01T00:00:00.000Z" },
      { id: "c", sort_value: "2026-01-01T00:01:00.000Z" },
    ];
    const first = paginateCursor(values, 2);
    const second = paginateCursor(values, 2, first.next_cursor);
    expect(first.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(second.items.map((item) => item.id)).toEqual(["c"]);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
  });

  it("returns a next cursor when a bounded route supplies limit plus one rows", () => {
    const request = new Request("https://example.test/api/moderation/reports?limit=2");
    const result = cursorPage(
      request,
      [
        { id: "00000000-0000-4000-8000-000000000001", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "00000000-0000-4000-8000-000000000002", created_at: "2026-01-01T00:01:00.000Z" },
        { id: "00000000-0000-4000-8000-000000000003", created_at: "2026-01-01T00:02:00.000Z" },
      ],
      (item) => item.id,
      (item) => item.created_at,
    );

    expect(result.error).toBeNull();
    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.page.has_more).toBe(true);
    expect(result.data?.page.next_cursor).toBeTruthy();
  });

  it("maps legacy rows through explicit allowlists", () => {
    const mappedFriend = mapFriend({
      ...contractFixtureFriend,
      requester: { ...contractFixtureProfile, push_tokens: [{ token: "secret" }], deleted_at: "secret" },
      operational_column: "secret",
    });
    expect(mappedFriend.requester).not.toHaveProperty("push_tokens");
    expect(mappedFriend.requester).not.toHaveProperty("deleted_at");
    expect(mappedFriend).not.toHaveProperty("operational_column");

    const mappedMessage = mapMessage({
      ...contractFixtureMessage,
      sender: { ...contractFixtureProfile, stripe_customer_id: "secret" },
      database_only: "secret",
    });
    expect(mappedMessage.sender).not.toHaveProperty("stripe_customer_id");
    expect(mappedMessage).not.toHaveProperty("database_only");

    expect(mapModerationReport({
      ...contractFixtureReport,
      reporter: null,
      reported_user: null,
      reviewer: null,
    })).toEqual(contractFixtureReport);
  });

  it("keeps error, authorization, and idempotency behavior stable", async () => {
    const unauthorized = apiError("Unauthorized", 401, "UNAUTHORIZED");
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({
      version: API_VERSION,
      error: "Unauthorized",
      message: "Unauthorized",
      code: "UNAUTHORIZED",
      request_id: null,
    });

    const invalid = idempotencyKey(new Request("https://example.test", {
      headers: { "idempotency-key": "short" },
    }));
    expect(invalid.error?.status).toBe(400);
    expect(idempotencyKey(new Request("https://example.test", {
      headers: { "idempotency-key": "contract-key-000001" },
    })).key).toBe("contract-key-000001");
  });

  it("returns the same safe envelope for unexpected route failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withRequestContext(async () => {
      throw new Error("database secret");
    });
    const response = await handler(new Request("https://example.test/api/profile", {
      headers: { "x-request-id": "request-failure-1" },
    }));

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("request-failure-1");
    expect(await response.json()).toEqual({
      version: API_VERSION,
      error: "Internal server error",
      message: "Internal server error",
      code: "INTERNAL_ERROR",
      request_id: "request-failure-1",
    });
    consoleError.mockRestore();
  });

  it("lets both transport layers validate typed endpoint payloads", () => {
    const peerProfile = {
      ...contractFixtureProfile,
      id: contractFixtureFriend.addressee_id,
      username: "peer",
    };
    const page = { version: API_VERSION, next_cursor: null, has_more: false, limit: 100 };
    expect(parseContractPayload(endpointContracts.friends.response, {
      viewer_id: contractFixtureProfile.id,
      friends: [{ ...contractFixtureFriend, addressee: peerProfile }],
      requests: [],
      sentRequests: [],
      sentRequestUserIds: [],
      pagination: { friends: page, requests: page, sentRequests: page },
    }).friends[0]).toMatchObject(contractFixtureFriend);
    expect(() => parseContractPayload(endpointContracts.threads.response, {
      viewer_id: contractFixtureProfile.id,
      threads: [{
        ...contractFixtureThread,
        participant_2: peerProfile,
      }],
      total_unread: contractFixtureThread.unread_count,
      pagination: page,
    })).not.toThrow();
    const messages = {
      thread: contractFixtureThread,
      messages: [contractFixtureMessage],
      pagination: contractFixturePage.page,
    };
    expect(parseContractPayload(messagesResponseSchema, messages)).toEqual(messages);
    expect(parseContractPayload(endpointContracts.messages.response, messages)).toEqual(messages);
    expect(() => parseContractPayload(messagesResponseSchema, {
      messages: [contractFixtureMessage],
      pagination: contractFixturePage.page,
    })).toThrow();
  });

  it("strictly validates the shared chat mutation response", () => {
    expect(messageMutationResponseSchema.parse({ message: contractFixtureMessage }))
      .toEqual({ message: contractFixtureMessage });
    expect(() => messageMutationResponseSchema.parse({ message: { ...contractFixtureMessage, id: "not-a-uuid" } }))
      .toThrow();
    expect(() => messageMutationResponseSchema.parse({
      message: contractFixtureMessage,
      database_only: "secret",
    })).toThrow();
  });

  it("strictly validates report list and request-correlated mutation responses", () => {
    const reviewed = {
      ...contractFixtureReport,
      status: "resolved" as const,
      reviewed_at: "2026-01-01T00:03:00.000Z",
      reviewed_by: contractFixtureProfile.id,
    };
    const mutation = { report: reviewed };
    expect(moderationReportMutationResponseSchema.parse(mutation)).toEqual(mutation);
    expect(moderationReportMutationResponseSchemaFor(reviewed.id, "resolved").parse(mutation))
      .toEqual(mutation);
    expect(() => moderationReportMutationResponseSchema.parse({
      ...mutation,
      database_only: "secret",
    })).toThrow();
    expect(() => moderationReportMutationResponseSchema.parse({
      report: { ...reviewed, database_only: "secret" },
    })).toThrow();
    expect(() => moderationReportMutationResponseSchemaFor(
      contractFixtureProfile.id,
      "resolved",
    ).parse(mutation)).toThrow();
    expect(() => moderationReportMutationResponseSchemaFor(
      reviewed.id,
      "dismissed",
    ).parse(mutation)).toThrow();

    const list = {
      reports: [contractFixtureReport],
      pagination: {
        version: API_VERSION,
        next_cursor: null,
        has_more: false,
        limit: 20,
      },
      legacy_pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    expect(moderationReportsResponseSchema.parse(list)).toEqual(list);
    expect(() => moderationReportsResponseSchema.parse({ ...list, internal_total: 1 })).toThrow();
    expect(() => moderationReportsResponseSchema.parse({
      ...list,
      reports: [{ ...contractFixtureReport, raw_reporter_id: "secret" }],
    })).toThrow();
  });

  it("strictly validates the shared chat media upload response", () => {
    const valid = { url: "https://media.example/photo.jpg", thumbnailUrl: null };
    expect(chatMediaUploadResponseSchema.parse(valid)).toEqual(valid);
    expect(() => chatMediaUploadResponseSchema.parse({ thumbnailUrl: null })).toThrow();
    expect(() => chatMediaUploadResponseSchema.parse({ ...valid, url: 42 })).toThrow();
    expect(() => chatMediaUploadResponseSchema.parse({ ...valid, storage_path: "private/user/photo.jpg" }))
      .toThrow();
  });

  it("accepts only configured private-media signed URLs with matching thumbnail shape", () => {
    const origin = "https://project.supabase.co";
    const uploaderId = "user-id";
    const schema = chatMediaUploadResponseSchemaFor(origin, uploaderId);
    const objectStem = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
    const main = `${origin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}.jpg?token=main-token`;
    const thumbnail = `${origin}/storage/v1/object/sign/media/${uploaderId}/${objectStem}_thumb.webp?token=thumb-token`;

    expect(schema.parse({ url: main, thumbnailUrl: thumbnail }))
      .toEqual({ url: main, thumbnailUrl: thumbnail });
    for (const extension of ["jpg", "png", "webp", "gif"]) {
      expect(schema.safeParse({
        url: main.replace(".jpg", `.${extension}`),
        thumbnailUrl: thumbnail.replace(".webp", `.${extension}`),
      }).success).toBe(true);
    }
    expect(schema.safeParse({ url: main.replace("https:", "http:"), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace(origin, "https://other.supabase.co"), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace("/sign/media/", "/public/media/"), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace("?token=main-token", ""), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace(uploaderId, "other-user"), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace(uploaderId, "%75ser-id"), thumbnailUrl: null }).success)
      .toBe(false);
    expect(schema.safeParse({ url: main.replace(uploaderId, "User-id"), thumbnailUrl: null }).success)
      .toBe(false);
    for (const invalidObjectName of [
      "object-id.jpg",
      "172250129678-550e8400-e29b-41d4-a716-446655440000.jpg",
      "17225012967890-550e8400-e29b-41d4-a716-446655440000.jpg",
      "1722501296789-550e8400-e29b-11d4-a716-446655440000.jpg",
      "1722501296789-550e8400-e29b-41d4-7716-446655440000.jpg",
      "1722501296789-550E8400-e29b-41d4-a716-446655440000.jpg",
      "1722501296789-550e8400-e29b-41d4-a716-446655440000.JPG",
      "1722501296789-550e8400-e29b-41d4-a716-446655440000.jpeg",
      "1722501296789-550e8400-e29b-41d4-a716-446655440000.svg",
      "1722501296789-550e8400-e29b-41d4-a716-446655440000.exe",
      "1722501296789-550e8400-e29b-41d4-a716-446655440000.tar.jpg",
    ]) {
      expect(schema.safeParse({
        url: main.replace(`${objectStem}.jpg`, invalidObjectName),
        thumbnailUrl: null,
      }).success).toBe(false);
    }
    for (const traversal of [
      main.replace(`${objectStem}.jpg`, `ignored/../${objectStem}.jpg`),
      main.replace(`${objectStem}.jpg`, `ignored/%2e%2e/${objectStem}.jpg`),
      main.replace(`${objectStem}.jpg`, `ignored/%2E%2e/${objectStem}.jpg`),
      main.replace(`${objectStem}.jpg`, `ignored%2f..%2F${objectStem}.jpg`),
      main.replace(`${objectStem}.jpg`, `ignored/%252e%252e%252f${objectStem}.jpg`),
    ]) {
      expect(schema.safeParse({ url: traversal, thumbnailUrl: null }).success).toBe(false);
    }
    expect(schema.safeParse({ url: thumbnail, thumbnailUrl: null }).success).toBe(false);
    expect(schema.safeParse({ url: main, thumbnailUrl: main }).success).toBe(false);
    expect(schema.safeParse({
      url: main,
      thumbnailUrl: thumbnail.replace(objectStem, "1722501296790-550e8400-e29b-41d4-a716-446655440000"),
    }).success).toBe(false);
    expect(schema.safeParse({
      url: main,
      thumbnailUrl: thumbnail.replace(uploaderId, "other-user"),
    }).success).toBe(false);
  });

  it("rejects legacy and malformed error envelopes", () => {
    expect(apiErrorEnvelopeSchema.safeParse(contractFixtureError).success).toBe(true);
    expect(apiErrorEnvelopeSchema.safeParse({ error: "Forbidden", code: "FORBIDDEN" }).success).toBe(false);
    expect(apiErrorEnvelopeSchema.safeParse({ ...contractFixtureError, debug: "secret" }).success).toBe(false);
    expect(apiErrorEnvelopeSchema.safeParse({ ...contractFixtureError, request_id: "unsafe request id" }).success)
      .toBe(false);
  });

  it("validates message UUID deduplication and sequence backfill hints", () => {
    const clientId = "00000000-0000-4000-8000-000000000010";
    expect(messageCreateSchema.parse({
      client_id: clientId,
      content: "Hello",
    })).toMatchObject({ client_id: clientId, content: "Hello" });
    expect(messageHintSchema.parse({
      thread_id: "00000000-0000-4000-8000-000000000020",
      action: "sent",
      sequence: 8,
    }).sequence).toBe(8);
    expect(messageHintNeedsBackfill(7, 8)).toBe(true);
    expect(messageHintNeedsBackfill(8, 8)).toBe(false);
    expect(messageHintHasGap(5, 8)).toBe(true);
    expect(messageHintHasGap(7, 8)).toBe(false);
  });

  it("keeps absent chat mutation fields omitted and rejects null or inconsistent media fields", () => {
    const clientId = "00000000-0000-4000-8000-000000000010";
    const replyId = "00000000-0000-4000-8000-000000000011";
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Hello",
    }).success).toBe(true);
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Photo",
      message_type: "image",
      media_url: "https://project.supabase.co/signed-main",
      reply_to_id: replyId,
    }).success).toBe(true);
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Hello",
      reply_to_id: null,
    }).success).toBe(false);
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Photo",
      message_type: "image",
      media_url: "https://project.supabase.co/signed-main",
      media_thumbnail_url: null,
    }).success).toBe(false);
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Photo",
      message_type: "image",
    }).success).toBe(false);
    expect(messageCreateSchema.safeParse({
      client_id: clientId,
      content: "Hello",
      media_url: "https://project.supabase.co/signed-main",
    }).success).toBe(false);
  });
});
