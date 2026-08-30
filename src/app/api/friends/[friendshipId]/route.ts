import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { friendshipUpdateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { idempotencyKey } from "@/lib/api-contract";
import {
  FRIEND_RESPONSE_OPERATION,
  friendResponseHash,
} from "@/lib/friend-response-idempotency";
import { currentRequestId } from "@/lib/request-context";
import {
  FRIEND_REMOVAL_OPERATION,
  friendRemovalHash,
} from "@/lib/friend-removal-idempotency";
import {
  apiErrorEnvelope,
  apiErrorEnvelopeSchema,
  friendshipRemovalResponseSchema,
  friendshipResponseSchema,
} from "@peekpoke/shared";
import { z } from "zod";

const friendResponseIdempotencyRecordSchema = z.strictObject({
  request_hash: z.string().regex(/^[0-9a-f]{64}$/),
  response_status: z.number().int().min(200).max(599).nullable(),
  response_body: z.unknown().nullable(),
  response_retry_after_seconds: z.number().int().min(1).max(60).nullable().optional().default(null),
});

const friendResponseRpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  retry_after_seconds: z.number().int().min(1).max(60).nullable().optional().default(null),
  replayed: z.boolean(),
});

function hasValidFriendResponseRetryAfter(status: number, retryAfterSeconds: number | null) {
  return status === 429 ? retryAfterSeconds !== null : retryAfterSeconds === null;
}

const friendRemovalIdempotencyRecordSchema = z.strictObject({
  request_hash: z.string().regex(/^[0-9a-f]{64}$/),
  response_status: z.number().int().min(200).max(599).nullable(),
  response_body: z.unknown().nullable(),
});

const friendRemovalRpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  replayed: z.boolean(),
});

function friendResponseIdempotencyError(
  key: string,
  message: string,
  status: number,
  code: string,
) {
  const response = NextResponse.json(
    apiErrorEnvelope(message, code, currentRequestId() ?? null),
    { status },
  );
  response.headers.set("idempotency-key", key);
  response.headers.set("cache-control", "no-store");
  if (status === 503) response.headers.set("retry-after", "5");
  return response;
}

function parseFriendResponse(
  status: number,
  body: unknown,
  actorId: string,
  friendshipId: string,
  action: "accepted" | "declined",
) {
  if (status === 200) {
    const parsed = friendshipResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.status !== action) return null;
    if (parsed.data.status === "declined") return parsed.data;
    if (
      parsed.data.friendship.id !== friendshipId
      || parsed.data.friendship.addressee_id !== actorId
    ) return null;
    return parsed.data;
  }
  const parsed = apiErrorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function friendResponse(
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

function friendRemovalIdempotencyError(
  key: string,
  message: string,
  status: number,
  code: string,
) {
  const response = NextResponse.json(
    apiErrorEnvelope(message, code, currentRequestId() ?? null),
    { status },
  );
  response.headers.set("idempotency-key", key);
  response.headers.set("cache-control", "no-store");
  if (status === 503) response.headers.set("retry-after", "5");
  return response;
}

function parseFriendRemoval(status: number, body: unknown) {
  if (status === 200) {
    const parsed = friendshipRemovalResponseSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  }
  const parsed = apiErrorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function friendRemovalResponse(
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

export const PATCH = withAuth<{ friendshipId: string }>(async (request, { user, params }) => {
  const { friendshipId } = params;

  if (!isValidUUID(friendshipId)) {
    return apiError("Invalid friendship ID", 400, "INVALID_FRIENDSHIP_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const [body, err] = await parseBody(request, friendshipUpdateSchema);
  if (err) return err;

  const action = body.status === "accepted" ? "accepted" : "declined";
  const serviceClient = createServiceClient();
  const requestHash = friendResponseHash(user.id, friendshipId, body);
  const { data: existingRaw, error: existingError } = await serviceClient
    .from("idempotency_records")
    .select("request_hash, response_status, response_body, response_retry_after_seconds")
    .eq("actor_id", user.id)
    .eq("operation", FRIEND_RESPONSE_OPERATION)
    .eq("key", idempotency.key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingError) {
    console.error("friends/[friendshipId]: idempotency preflight unavailable", existingError);
    return friendResponseIdempotencyError(
      idempotency.key,
      "Friend response service temporarily unavailable",
      503,
      "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  if (existingRaw) {
    const existing = friendResponseIdempotencyRecordSchema.safeParse(existingRaw);
    if (
      !existing.success
      || existing.data.response_status === null
      || existing.data.response_body === null
      || !hasValidFriendResponseRetryAfter(
        existing.data.response_status,
        existing.data.response_retry_after_seconds,
      )
    ) {
      console.error("friends/[friendshipId]: invalid or incomplete idempotency record");
      return friendResponseIdempotencyError(
        idempotency.key,
        "Friend response service temporarily unavailable",
        503,
        "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    if (existing.data.request_hash !== requestHash) {
      return friendResponseIdempotencyError(
        idempotency.key,
        "Idempotency key was already used for a different request",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const storedBody = parseFriendResponse(
      existing.data.response_status,
      existing.data.response_body,
      user.id,
      friendshipId,
      action,
    );
    if (!storedBody) {
      console.error("friends/[friendshipId]: invalid stored idempotency response");
      return friendResponseIdempotencyError(
        idempotency.key,
        "Friend response service temporarily unavailable",
        503,
        "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    return friendResponse(
      existing.data.response_status,
      storedBody,
      idempotency.key,
      true,
      existing.data.response_retry_after_seconds,
    );
  }

  // Existing keys replay first. Unseen keys serialize on the bounded
  // actor+operation bucket, are rechecked after that lock, and are durably
  // claimed only when admitted; denials reuse one deterministic bucket 429.
  const { data, error } = await serviceClient.rpc("respond_friend_request_idempotent", {
    p_actor_id: user.id,
    p_friendship_id: friendshipId,
    p_action: action,
    p_operation: FRIEND_RESPONSE_OPERATION,
    p_idempotency_key: idempotency.key,
    p_request_hash: requestHash,
    p_request_id: currentRequestId() ?? null,
  });

  if (error) {
    console.error("friends/[friendshipId]: idempotent RPC unavailable", error);
    return friendResponseIdempotencyError(
      idempotency.key,
      "Friend response service temporarily unavailable",
      503,
      "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  const result = friendResponseRpcResultSchema.safeParse(data);
  if (
    !result.success
    || !hasValidFriendResponseRetryAfter(
      result.data.response_status,
      result.data.retry_after_seconds,
    )
  ) {
    console.error("friends/[friendshipId]: invalid idempotent RPC result");
    return friendResponseIdempotencyError(
      idempotency.key,
      "Friend response service temporarily unavailable",
      503,
      "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  const responseBody = parseFriendResponse(
    result.data.response_status,
    result.data.response_body,
    user.id,
    friendshipId,
    action,
  );
  if (!responseBody) {
    console.error("friends/[friendshipId]: invalid idempotent response DTO");
    return friendResponseIdempotencyError(
      idempotency.key,
      "Friend response service temporarily unavailable",
      503,
      "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  return friendResponse(
    result.data.response_status,
    responseBody,
    idempotency.key,
    result.data.replayed,
    result.data.retry_after_seconds,
  );
});

export const DELETE = withAuth<{ friendshipId: string }>(async (request, { user, params }) => {
  const { friendshipId } = params;

  if (!isValidUUID(friendshipId)) {
    return apiError("Invalid friendship ID", 400, "INVALID_FRIENDSHIP_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const serviceClient = createServiceClient();
  const requestHash = friendRemovalHash(user.id, friendshipId);
  const { data: existingRaw, error: existingError } = await serviceClient
    .from("idempotency_records")
    .select("request_hash, response_status, response_body")
    .eq("actor_id", user.id)
    .eq("operation", FRIEND_REMOVAL_OPERATION)
    .eq("key", idempotency.key)
    .maybeSingle();
  if (existingError) {
    console.error("friends/[friendshipId]: removal idempotency preflight unavailable", existingError);
    return friendRemovalIdempotencyError(
      idempotency.key,
      "Friend removal service temporarily unavailable",
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  if (existingRaw) {
    const existing = friendRemovalIdempotencyRecordSchema.safeParse(existingRaw);
    if (!existing.success || existing.data.response_status === null || existing.data.response_body === null) {
      console.error("friends/[friendshipId]: invalid or incomplete removal idempotency record");
      return friendRemovalIdempotencyError(
        idempotency.key,
        "Friend removal service temporarily unavailable",
        503,
        "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    if (existing.data.request_hash !== requestHash) {
      return friendRemovalIdempotencyError(
        idempotency.key,
        "Idempotency key was already used for a different request",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const storedBody = parseFriendRemoval(
      existing.data.response_status,
      existing.data.response_body,
    );
    if (!storedBody) {
      console.error("friends/[friendshipId]: invalid stored removal response");
      return friendRemovalIdempotencyError(
        idempotency.key,
        "Friend removal service temporarily unavailable",
        503,
        "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    return friendRemovalResponse(
      existing.data.response_status,
      storedBody,
      idempotency.key,
      true,
    );
  }

  // Every concurrent copy must reach the atomic claim. A limiter between the
  // preflight and RPC could make one same-key caller abandon while another commits.
  const { data, error } = await serviceClient.rpc("remove_friendship_idempotent", {
    p_actor_id: user.id,
    p_friendship_id: friendshipId,
    p_operation: FRIEND_REMOVAL_OPERATION,
    p_idempotency_key: idempotency.key,
    p_request_hash: requestHash,
    p_request_id: currentRequestId() ?? null,
  });

  if (error) {
    console.error("friends/[friendshipId]: idempotent removal RPC unavailable", error);
    return friendRemovalIdempotencyError(
      idempotency.key,
      "Friend removal service temporarily unavailable",
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  const result = friendRemovalRpcResultSchema.safeParse(data);
  if (!result.success) {
    console.error("friends/[friendshipId]: invalid idempotent removal RPC result");
    return friendRemovalIdempotencyError(
      idempotency.key,
      "Friend removal service temporarily unavailable",
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  const responseBody = parseFriendRemoval(
    result.data.response_status,
    result.data.response_body,
  );
  if (!responseBody) {
    console.error("friends/[friendshipId]: invalid idempotent removal response DTO");
    return friendRemovalIdempotencyError(
      idempotency.key,
      "Friend removal service temporarily unavailable",
      503,
      "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  return friendRemovalResponse(
    result.data.response_status,
    responseBody,
    idempotency.key,
    result.data.replayed,
  );
});
