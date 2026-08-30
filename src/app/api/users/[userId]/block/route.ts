import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyFriendshipChanged } from "@/lib/realtime-broadcast";
import { apiError } from "@/lib/api-error";
import { idempotencyKey } from "@/lib/api-contract";
import { currentRequestId } from "@/lib/request-context";
import { blockUserHash, USER_BLOCK_OPERATION } from "@/lib/block-user-idempotency";
import {
  apiErrorEnvelope,
  apiErrorEnvelopeSchema,
  blockUserResponseSchema,
} from "@peekpoke/shared";
import { z } from "zod";

const blockIdempotencyRecordSchema = z.strictObject({
  request_hash: z.string().regex(/^[0-9a-f]{64}$/),
  response_status: z.number().int().min(200).max(599).nullable(),
  response_body: z.unknown().nullable(),
  response_retry_after_seconds: z.number().int().min(1).max(86_400).nullable().optional().default(null),
});

const blockRpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  retry_after_seconds: z.number().int().min(1).max(86_400).nullable().optional().default(null),
  replayed: z.boolean(),
});

function hasValidRetryAfter(status: number, retryAfterSeconds: number | null) {
  return status === 429 ? retryAfterSeconds !== null : retryAfterSeconds === null;
}

function parseBlockResponse(status: number, body: unknown) {
  const parsed = status === 200
    ? blockUserResponseSchema.safeParse(body)
    : apiErrorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function blockResponse(
  status: number,
  body: unknown,
  key: string,
  replayed: boolean,
  retryAfterSeconds: number | null = null,
) {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "idempotency-key": key,
      "x-idempotency-replayed": replayed ? "true" : "false",
    },
  });
  if (status === 429 && retryAfterSeconds !== null) {
    response.headers.set("retry-after", String(retryAfterSeconds));
  }
  return response;
}

function blockIdempotencyError(key: string, message: string, status: number, code: string) {
  const response = NextResponse.json(
    apiErrorEnvelope(message, code, currentRequestId() ?? null),
    { status },
  );
  response.headers.set("idempotency-key", key);
  response.headers.set("cache-control", "no-store");
  if (status === 503) response.headers.set("retry-after", "5");
  return response;
}

export const POST = withAuth<{ userId: string }>(async (request, { user, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId) || userId === user.id) {
    return apiError("Invalid user ID", 400, "INVALID_USER_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const serviceClient = createServiceClient();
  const requestHash = blockUserHash(user.id, userId);
  const { data: existingRaw, error: existingError } = await serviceClient
    .from("idempotency_records")
    .select("request_hash, response_status, response_body, response_retry_after_seconds")
    .eq("actor_id", user.id)
    .eq("operation", USER_BLOCK_OPERATION)
    .eq("key", idempotency.key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingError) {
    console.error("users/[userId]/block: idempotency preflight unavailable", existingError);
    return blockIdempotencyError(
      idempotency.key,
      "Block service temporarily unavailable",
      503,
      "BLOCK_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  if (existingRaw) {
    const existing = blockIdempotencyRecordSchema.safeParse(existingRaw);
    if (
      !existing.success
      || existing.data.response_status === null
      || existing.data.response_body === null
      || !hasValidRetryAfter(
        existing.data.response_status,
        existing.data.response_retry_after_seconds,
      )
    ) {
      console.error("users/[userId]/block: invalid or incomplete idempotency record");
      return blockIdempotencyError(
        idempotency.key,
        "Block service temporarily unavailable",
        503,
        "BLOCK_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    if (existing.data.request_hash !== requestHash) {
      return blockIdempotencyError(
        idempotency.key,
        "Idempotency key was already used for a different request",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const storedBody = parseBlockResponse(
      existing.data.response_status,
      existing.data.response_body,
    );
    if (!storedBody) {
      console.error("users/[userId]/block: invalid stored idempotency response");
      return blockIdempotencyError(
        idempotency.key,
        "Block service temporarily unavailable",
        503,
        "BLOCK_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    return blockResponse(
      existing.data.response_status,
      storedBody,
      idempotency.key,
      true,
      existing.data.response_retry_after_seconds,
    );
  }

  const { data, error } = await serviceClient.rpc("block_user_idempotent", {
    p_actor_id: user.id,
    p_blocked_id: userId,
    p_operation: USER_BLOCK_OPERATION,
    p_idempotency_key: idempotency.key,
    p_request_hash: requestHash,
    p_request_id: currentRequestId() ?? null,
  });

  if (error) {
    console.error("users/[userId]/block: idempotent block RPC unavailable", error);
    return blockIdempotencyError(
      idempotency.key,
      "Block service temporarily unavailable",
      503,
      "BLOCK_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  const result = blockRpcResultSchema.safeParse(data);
  if (!result.success || !hasValidRetryAfter(
    result.data.response_status,
    result.data.retry_after_seconds,
  )) {
    console.error("users/[userId]/block: invalid idempotent block RPC result");
    return blockIdempotencyError(
      idempotency.key,
      "Block service temporarily unavailable",
      503,
      "BLOCK_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  const responseBody = parseBlockResponse(
    result.data.response_status,
    result.data.response_body,
  );
  if (!responseBody) {
    console.error("users/[userId]/block: invalid idempotent response DTO");
    return blockIdempotencyError(
      idempotency.key,
      "Block service temporarily unavailable",
      503,
      "BLOCK_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  return blockResponse(
    result.data.response_status,
    responseBody,
    idempotency.key,
    result.data.replayed,
    result.data.retry_after_seconds,
  );
});

export const DELETE = withAuth<{ userId: string }>(async (_request, { user, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId) || userId === user.id) {
    return apiError("Invalid user ID", 400, "INVALID_USER_ID");
  }
  const limited = await enforceRateLimit("userBlock", user.id);
  if (limited) return limited;

  const { data, error } = await createServiceClient().rpc("unblock_user", {
    p_blocker_id: user.id,
    p_blocked_id: userId,
  });

  if (error) {
    console.error("users/[userId]/block:", error);
    return apiError("Failed to unblock user", 500, "UNBLOCK_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, data.status || 400, "UNBLOCK_FAILED");
  }

  await notifyFriendshipChanged(user.id, userId);
  return NextResponse.json({ success: true });
});
