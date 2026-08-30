import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorEnvelope,
  apiErrorEnvelopeSchema,
  messageMutationResponseSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { dmMessageEditSchema, parseBody } from "@/lib/validators";
import { createServiceClient } from "@/lib/supabase/server";
import { idempotencyKey } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { currentRequestId } from "@/lib/request-context";
import {
  DM_MESSAGE_DELETE_OPERATION,
  DM_MESSAGE_EDIT_OPERATION,
  dmMessageDeleteHash,
  dmMessageEditHash,
} from "@/lib/dm-message-mutation-idempotency";

const idempotencyRecordSchema = z.strictObject({
  request_hash: z.string().regex(/^[0-9a-f]{64}$/),
  response_status: z.number().int().min(200).max(599).nullable(),
  response_body: z.unknown().nullable(),
});

const rpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  replayed: z.boolean(),
});

type MutationAction = "edit" | "delete";

function idempotencyError(
  key: string,
  message: string,
  status: number,
  code: string,
) {
  const response = NextResponse.json(
    apiErrorEnvelope(message, code, currentRequestId() ?? null),
    { status },
  );
  response.headers.set("cache-control", "no-store");
  response.headers.set("idempotency-key", key);
  response.headers.set("x-idempotency-replayed", "false");
  if (status === 503) response.headers.set("retry-after", "5");
  return response;
}

function parseMutationBody(
  status: number,
  body: unknown,
  actorId: string,
  threadId: string,
  messageId: string,
  action: MutationAction,
  content: string | null,
) {
  if (status !== 200) {
    const parsed = apiErrorEnvelopeSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  }

  const parsed = messageMutationResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  if (
    message.id !== messageId
    || message.thread_id !== threadId
    || message.sender_id !== actorId
  ) return null;
  if (action === "delete") {
    return message.is_deleted
      && message.content === null
      && message.media_url === null
      && message.media_thumbnail_url === null
      ? parsed.data
      : null;
  }
  return !message.is_deleted && message.is_edited && message.content === content
    ? parsed.data
    : null;
}

function mutationResponse(
  status: number,
  body: unknown,
  key: string,
  replayed: boolean,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "idempotency-key": key,
      "x-idempotency-replayed": replayed ? "true" : "false",
    },
  });
}

async function executeMutation({
  actorId,
  threadId,
  messageId,
  action,
  content,
  key,
  requestHash,
}: {
  actorId: string;
  threadId: string;
  messageId: string;
  action: MutationAction;
  content: string | null;
  key: string;
  requestHash: string;
}) {
  const operation = action === "edit"
    ? DM_MESSAGE_EDIT_OPERATION
    : DM_MESSAGE_DELETE_OPERATION;
  const serviceClient = createServiceClient();
  const { data: existingRaw, error: existingError } = await serviceClient
    .from("idempotency_records")
    .select("request_hash, response_status, response_body")
    .eq("actor_id", actorId)
    .eq("operation", operation)
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingError) {
    console.error("dm/[threadId]/[messageId]: idempotency preflight unavailable", existingError);
    return idempotencyError(
      key,
      "Message mutation service temporarily unavailable",
      503,
      "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  if (existingRaw) {
    const existing = idempotencyRecordSchema.safeParse(existingRaw);
    if (
      !existing.success
      || existing.data.response_status === null
      || existing.data.response_body === null
    ) {
      console.error("dm/[threadId]/[messageId]: invalid idempotency record");
      return idempotencyError(
        key,
        "Message mutation service temporarily unavailable",
        503,
        "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    if (existing.data.request_hash !== requestHash) {
      return idempotencyError(
        key,
        "Idempotency key was already used for a different request",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const storedBody = parseMutationBody(
      existing.data.response_status,
      existing.data.response_body,
      actorId,
      threadId,
      messageId,
      action,
      content,
    );
    if (!storedBody) {
      console.error("dm/[threadId]/[messageId]: invalid stored response DTO");
      return idempotencyError(
        key,
        "Message mutation service temporarily unavailable",
        503,
        "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    return mutationResponse(existing.data.response_status, storedBody, key, true);
  }

  // Every concurrent copy reaches the same database claim. Inserting a
  // limiter or authorization call here could make identical callers diverge.
  const { data, error } = await serviceClient.rpc("mutate_dm_message_idempotent", {
    p_actor_id: actorId,
    p_thread_id: threadId,
    p_message_id: messageId,
    p_action: action,
    p_content: content,
    p_operation: operation,
    p_idempotency_key: key,
    p_request_hash: requestHash,
    p_request_id: currentRequestId() ?? null,
  });
  if (error) {
    console.error("dm/[threadId]/[messageId]: idempotent RPC unavailable", error);
    return idempotencyError(
      key,
      "Message mutation service temporarily unavailable",
      503,
      "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    console.error("dm/[threadId]/[messageId]: invalid RPC result");
    return idempotencyError(
      key,
      "Message mutation service temporarily unavailable",
      503,
      "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  const responseBody = parseMutationBody(
    result.data.response_status,
    result.data.response_body,
    actorId,
    threadId,
    messageId,
    action,
    content,
  );
  if (!responseBody) {
    console.error("dm/[threadId]/[messageId]: invalid response DTO");
    return idempotencyError(
      key,
      "Message mutation service temporarily unavailable",
      503,
      "MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  return mutationResponse(
    result.data.response_status,
    responseBody,
    key,
    result.data.replayed,
  );
}

export const PATCH = withAuth<{ threadId: string; messageId: string }>(
  async (request, { user, params }) => {
    const { threadId, messageId } = params;
    if (!isValidUUID(threadId) || !isValidUUID(messageId)) {
      return apiError("Invalid ID", 400, "INVALID_MESSAGE_ID");
    }
    const idempotency = idempotencyKey(request);
    if (idempotency.error) return idempotency.error;
    if (!idempotency.key) {
      return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
    }
    const [body, bodyError] = await parseBody(request, dmMessageEditSchema);
    if (bodyError) return bodyError;

    return executeMutation({
      actorId: user.id,
      threadId,
      messageId,
      action: "edit",
      content: body.content,
      key: idempotency.key,
      requestHash: dmMessageEditHash(user.id, threadId, messageId, body),
    });
  },
);

export const DELETE = withAuth<{ threadId: string; messageId: string }>(
  async (request, { user, params }) => {
    const { threadId, messageId } = params;
    if (!isValidUUID(threadId) || !isValidUUID(messageId)) {
      return apiError("Invalid ID", 400, "INVALID_MESSAGE_ID");
    }
    const idempotency = idempotencyKey(request);
    if (idempotency.error) return idempotency.error;
    if (!idempotency.key) {
      return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
    }
    if (request.body !== null) {
      return apiError("DELETE does not accept a request body", 400, "VALIDATION_ERROR");
    }

    return executeMutation({
      actorId: user.id,
      threadId,
      messageId,
      action: "delete",
      content: null,
      key: idempotency.key,
      requestHash: dmMessageDeleteHash(user.id, threadId, messageId),
    });
  },
);
