import { NextResponse } from "next/server";
import {
  API_VERSION,
  chatMediaUploadResponseSchemaFor,
  decodeCursor,
  messageCreateSchema,
  messageMutationResponseSchema,
  messageSchema,
} from "@peekpoke/shared";
import { z } from "zod";
import {
  isBlocked,
  isDeletedProfile,
  verifyThreadMembership,
  withAuth,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { canonicalStorageUrl, signPrivateMessageMedia, storageObjectFromUrl } from "@/lib/storage-urls";
import { createServiceClient } from "@/lib/supabase/server";
import {
  idempotencyKey,
  DURABLE_MESSAGE_COLUMNS,
  mapMessage,
  mapThreadSummary,
  MESSAGE_COLUMNS,
  parseContractPagination,
} from "@/lib/api-contract";
import {
  finalizeDescendingMessagePage,
  olderThanMessageCursor,
} from "@/lib/message-history";

const messageRpcErrorSchema = z.strictObject({
  error: z.enum([
    "THREAD_NOT_FOUND",
    "BLOCKED",
    "ACCOUNT_DELETED",
    "REPLY_TARGET_NOT_FOUND",
    "INVALID_MEDIA",
    "MEDIA_ALREADY_CLAIMED",
    "IDEMPOTENCY_KEY_REUSED",
  ]),
});

const transactionalMessageRpcSuccessSchema = z.strictObject({
  message: messageSchema,
  deduplicated: z.boolean(),
});

export const GET = withAuth<{ threadId: string }>(async (request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "THREAD_NOT_FOUND");
  }

  const thread = await verifyThreadMembership(threadId, user.id);
  if (!thread) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  const peerId = thread.participant_1_id === user.id
    ? thread.participant_2_id
    : thread.participant_1_id;
  if (await isBlocked(supabase, user.id, peerId)) {
    return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  }

  const pagination = parseContractPagination(request);
  if (pagination.error) return pagination.error;
  const decodedCursor = pagination.data.cursor
    ? decodeCursor(pagination.data.cursor)
    : null;
  const service = createServiceClient();
  const { data: threadDetails, error: threadError } = await service
    .from("dm_threads")
    .select("id, participant_1_id, participant_2_id, last_message_at, last_message_preview, created_at, participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at, deleted_at), participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at, deleted_at)")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError || !threadDetails) {
    console.error("dm/[threadId] thread:", threadError);
    return apiError("Internal server error", 500, "THREAD_NOT_FOUND");
  }

  const fetchMessagePage = (columns: string) => {
    let query = service
      .from("dm_messages")
      .select(columns)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pagination.data.limit + 1);
    if (decodedCursor) {
      query = query.or(olderThanMessageCursor(decodedCursor));
    }
    return query;
  };
  let { data: messageRows, error: messagesError } = await fetchMessagePage(DURABLE_MESSAGE_COLUMNS);
  if (messagesError?.code === "42703" || messagesError?.code === "PGRST204") {
    ({ data: messageRows, error: messagesError } = await fetchMessagePage(MESSAGE_COLUMNS));
  }
  if (messagesError) {
    console.error("dm/[threadId] messages:", messagesError);
    return apiError("Internal server error", 500, "THREAD_NOT_FOUND");
  }
  const page = finalizeDescendingMessagePage(
    (messageRows ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    media_url?: string | null;
    media_thumbnail_url?: string | null;
    [key: string]: unknown;
    }>,
    pagination.data.limit,
  );
  const pageRows = page.items;
  let messages = (await signPrivateMessageMedia(service, pageRows))
    .map(mapMessage)
    .reverse();
  const { data: peerCursor, error: cursorError } = await service
    .from("dm_thread_members")
    .select("last_read_sequence")
    .eq("thread_id", threadId)
    .eq("user_id", peerId)
    .maybeSingle();
  if (!cursorError && peerCursor) {
    const lastReadSequence = Number(peerCursor.last_read_sequence ?? 0);
    messages = messages.map((message) => (
      message.sender_id === user.id && typeof message.sequence === "number"
        ? { ...message, is_read: message.sequence <= lastReadSequence }
        : message
    ));
  } else if (cursorError && cursorError.code !== "42P01" && cursorError.code !== "PGRST205") {
    console.error("dm/[threadId] read cursor:", cursorError);
    return apiError("Internal server error", 500, "THREAD_NOT_FOUND");
  }
  return NextResponse.json({
    thread: mapThreadSummary(threadDetails),
    messages,
    pagination: {
      version: API_VERSION,
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
      limit: pagination.data.limit,
    },
  });
});

export const POST = withAuth<{ threadId: string }>(async (request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "THREAD_NOT_FOUND");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const [msg, err] = await parseBody(request, messageCreateSchema);
  if (err) return err;
  if (msg.client_id !== idempotency.key) {
    return apiError("Idempotency key does not match client ID", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const limited = await enforceRateLimit("sendMessage", user.id);
  if (limited) return limited;

  // Authorize: verify caller is a thread participant before touching the RPC
  const thread = await verifyThreadMembership(threadId, user.id);
  if (!thread) {
    return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  }
  const peerId = thread.participant_1_id === user.id
    ? thread.participant_2_id
    : thread.participant_1_id;
  if (await isDeletedProfile(peerId)) {
    return apiError("Cannot message this user", 410, "ACCOUNT_DELETED");
  }
  if (await isBlocked(supabase, user.id, peerId)) {
    return apiError("Cannot message this user", 403, "BLOCKED");
  }

  if (msg.reply_to_id) {
    const { data: replyTarget, error: replyError } = await createServiceClient()
      .from("dm_messages")
      .select("id")
      .eq("id", msg.reply_to_id)
      .eq("thread_id", threadId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (replyError) {
      console.error("dm/[threadId] reply validation:", replyError);
      return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
    }
    if (!replyTarget) {
      return apiError("Reply target not found", 400, "MESSAGE_SEND_FAILED");
    }
  }

  const service = createServiceClient();
  let mediaUrl = msg.media_url ?? null;
  let mediaThumbnailUrl = msg.media_thumbnail_url ?? null;
  if (msg.media_url) {
    const mediaInput = chatMediaUploadResponseSchemaFor(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      user.id,
    ).safeParse({
      url: msg.media_url,
      thumbnailUrl: msg.media_thumbnail_url ?? null,
    });
    if (!mediaInput.success) {
      return apiError("Invalid media", 400, "MESSAGE_SEND_FAILED");
    }

    const mediaObject = storageObjectFromUrl(msg.media_url);
    const thumbnailObject = storageObjectFromUrl(msg.media_thumbnail_url);
    if (!mediaObject || (msg.media_thumbnail_url && !thumbnailObject)) {
      return apiError("Invalid media", 400, "MESSAGE_SEND_FAILED");
    }

    // Treat client-supplied signed-URL tokens as opaque. Authorization comes
    // from exact owner-bound paths that exist under service-role Storage access.
    const objectState = await verifyMessageMediaObjects(
      service,
      thumbnailObject ? [mediaObject, thumbnailObject] : [mediaObject],
    );
    if (objectState === "unavailable") {
      return apiError(
        "Message media temporarily unavailable",
        503,
        "MESSAGE_SEND_FAILED",
      );
    }
    if (objectState === "missing") {
      return apiError("Invalid media", 400, "MESSAGE_SEND_FAILED");
    }

    mediaUrl = canonicalStorageUrl("media", mediaObject.path);
    mediaThumbnailUrl = thumbnailObject
      ? canonicalStorageUrl("media", thumbnailObject.path)
      : null;
  }

  const clientId = msg.client_id;
  const { data, error } = await service.rpc("send_message_transactional", {
    p_thread_id: threadId,
    p_sender_id: user.id,
    p_client_id: clientId,
    p_content: msg.content,
    p_message_type: msg.message_type,
    p_media_url: mediaUrl,
    p_media_thumbnail_url: mediaThumbnailUrl,
    p_reply_to_id: msg.reply_to_id || null,
  });

  // Migration-first invariant: never fall back to the non-idempotent legacy
  // RPC. The durable migration must be promoted before application traffic.
  if (error?.code === "PGRST202") {
    return messageSendUnavailable();
  }

  if (error) {
    console.error("dm/[threadId]:", error);
    return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
  }

  const rpcDenial = messageRpcErrorSchema.safeParse(data);
  if (rpcDenial.success) {
    if (rpcDenial.data.error === "MEDIA_ALREADY_CLAIMED") {
      return apiError(
        "Message media was already used",
        409,
        "MESSAGE_MEDIA_ALREADY_CLAIMED",
      );
    }
    if (rpcDenial.data.error === "IDEMPOTENCY_KEY_REUSED") {
      return apiError(
        "Idempotency key was already used for a different message",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    if (rpcDenial.data.error === "INVALID_MEDIA") {
      return apiError("Invalid media", 400, "MESSAGE_SEND_FAILED");
    }
    return apiError("Cannot send message", 403, "MESSAGE_SEND_FAILED");
  }

  const rawResult = transactionalMessageRpcSuccessSchema.safeParse(data);
  if (!rawResult.success) {
    console.error("dm/[threadId]: malformed message RPC response");
    return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
  }
  const rawMessage = rawResult.data.message;

  if (
    rawMessage.thread_id !== threadId
    || rawMessage.sender_id !== user.id
    || rawMessage.client_id !== clientId
    || rawMessage.content !== msg.content
    || rawMessage.message_type !== msg.message_type
    || rawMessage.media_url !== mediaUrl
    || rawMessage.media_thumbnail_url !== mediaThumbnailUrl
    || rawMessage.reply_to_id !== (msg.reply_to_id ?? null)
  ) {
    console.error("dm/[threadId]: message RPC response does not match request");
    return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
  }

  const [signedMessage] = await signPrivateMessageMedia(service, [rawMessage]);
  const response = messageMutationResponseSchema.safeParse({
    message: mapMessage(signedMessage),
  });
  if (!response.success) {
    console.error("dm/[threadId]: malformed public message response");
    return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
  }
  return NextResponse.json(response.data, {
    headers: { "idempotency-key": clientId },
  });
});

function messageSendUnavailable() {
  const response = apiError(
    "Message sending temporarily unavailable",
    503,
    "MESSAGE_SEND_UNAVAILABLE",
  );
  response.headers.set("Retry-After", "5");
  return response;
}

async function verifyMessageMediaObjects(
  service: ReturnType<typeof createServiceClient>,
  objects: Array<{ bucket: string; path: string }>,
): Promise<"exists" | "missing" | "unavailable"> {
  try {
    const results = await Promise.all(objects.map((object) =>
      service.storage.from(object.bucket).exists(object.path)
    ));
    if (results.every((result) => result.data === true && !result.error)) {
      return "exists";
    }
    if (results.some((result) => {
      const status = storageErrorStatus(result.error);
      return result.data === false && (status === 400 || status === 404);
    })) {
      return "missing";
    }
    console.error("dm/[threadId] media existence verification failed");
    return "unavailable";
  } catch (error) {
    console.error("dm/[threadId] media existence verification failed:", error);
    return "unavailable";
  }
}

function storageErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const direct = Number(record.status ?? record.statusCode);
  if (Number.isInteger(direct)) return direct;
  const original = record.originalError;
  if (!original || typeof original !== "object") return null;
  const nested = Number((original as Record<string, unknown>).status);
  return Number.isInteger(nested) ? nested : null;
}
