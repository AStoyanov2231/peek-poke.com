import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { friendRequestSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { cursorPage, idempotencyKey, mapFriend } from "@/lib/api-contract";
import {
  FRIEND_REQUEST_CREATE_OPERATION,
  friendRequestHash,
} from "@/lib/friend-request-idempotency";
import { currentRequestId } from "@/lib/request-context";
import {
  apiErrorEnvelope,
  apiErrorEnvelopeSchema,
  friendsReadResponseSchema,
  friendshipCreateResponseSchema,
  MAX_PAGE_SIZE,
  utcTimestampSchema,
} from "@peekpoke/shared";
import { z } from "zod";

const friendshipProfileRowSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  location_text: z.string().nullable(),
  is_online: z.boolean(),
  last_seen_at: utcTimestampSchema.nullable(),
});

const acceptedFriendshipRowSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("accepted"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileRowSchema,
  addressee: friendshipProfileRowSchema,
}).refine((row) => row.requester_id !== row.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const incomingFriendshipRowSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  requester: friendshipProfileRowSchema,
}).refine((row) => row.requester_id !== row.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const sentFriendshipRowSchema = z.strictObject({
  id: z.uuid(),
  requester_id: z.uuid(),
  addressee_id: z.uuid(),
  status: z.literal("pending"),
  requested_at: utcTimestampSchema,
  responded_at: utcTimestampSchema.nullable(),
  addressee: friendshipProfileRowSchema,
}).refine((row) => row.requester_id !== row.addressee_id, {
  path: ["addressee_id"],
  message: "Friendship participants must be distinct",
});

const legacyPeerRoleSchema = z.object({
  id: z.uuid(),
  roles: z.array(z.string().min(1).max(64)).max(16).optional(),
});

const legacyFriendsResultSchema = z.object({
  friends: z.array(legacyPeerRoleSchema).max(MAX_PAGE_SIZE + 1),
}).superRefine((value, context) => {
  const ids = value.friends.map((friend) => friend.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["friends"], message: "Duplicate legacy friend" });
  }
});

const acceptedFriendshipRowsSchema = z.array(acceptedFriendshipRowSchema).max(MAX_PAGE_SIZE + 1);
const incomingFriendshipRowsSchema = z.array(incomingFriendshipRowSchema).max(MAX_PAGE_SIZE + 1);
const sentFriendshipRowsSchema = z.array(sentFriendshipRowSchema).max(MAX_PAGE_SIZE + 1);
const friendRequestIdempotencyRecordSchema = z.strictObject({
  request_hash: z.string().regex(/^[0-9a-f]{64}$/),
  response_status: z.number().int().min(200).max(599).nullable(),
  response_body: z.unknown().nullable(),
  response_retry_after_seconds: z.number().int().min(1).max(60).nullable().optional().default(null),
});
const friendRequestRpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  retry_after_seconds: z.number().int().min(1).max(60).nullable().optional().default(null),
  replayed: z.boolean(),
});

function hasValidRetryAfter(status: number, retryAfterSeconds: number | null) {
  return status === 429 ? retryAfterSeconds !== null : retryAfterSeconds === null;
}

function hasDuplicateIds(rows: readonly { id: string }[]) {
  return new Set(rows.map((row) => row.id)).size !== rows.length;
}

function hasDuplicatePeers(
  viewerId: string,
  accepted: readonly z.infer<typeof acceptedFriendshipRowSchema>[],
  incoming: readonly z.infer<typeof incomingFriendshipRowSchema>[],
  sent: readonly z.infer<typeof sentFriendshipRowSchema>[],
) {
  const peerIds = [
    ...accepted.map((row) => row.requester_id === viewerId ? row.addressee_id : row.requester_id),
    ...incoming.map((row) => row.requester_id),
    ...sent.map((row) => row.addressee_id),
  ];
  return new Set(peerIds).size !== peerIds.length;
}

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
  response.headers.set("idempotency-key", key);
  response.headers.set("cache-control", "no-store");
  if (status === 503) response.headers.set("retry-after", "5");
  return response;
}

function parseFriendRequestResponse(
  status: number,
  body: unknown,
  actorId: string,
  addresseeId: string,
) {
  if (status === 200) {
    const parsed = friendshipCreateResponseSchema.safeParse(body);
    if (
      !parsed.success
      || parsed.data.friendship.requester_id !== actorId
      || parsed.data.friendship.addressee_id !== addresseeId
    ) return null;
    return parsed.data;
  }
  const parsed = apiErrorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function idempotentResponse(
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

export const GET = withAuth(async (request, { user }) => {
  const serviceClient = createServiceClient();
  const [legacyResult, acceptedResult, incomingResult, sentResult] = await Promise.all([
    serviceClient.rpc("get_friends", { p_user_id: user.id }),
    serviceClient
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requested_at, responded_at, requester:profiles!requester_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at), addressee:profiles!addressee_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted")
      .order("requested_at", { ascending: false })
      .limit(101),
    serviceClient
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requested_at, responded_at, requester:profiles!requester_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
      .eq("addressee_id", user.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(101),
    serviceClient
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requested_at, responded_at, addressee:profiles!addressee_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
      .eq("requester_id", user.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(101),
  ]);

  const error = legacyResult.error ?? acceptedResult.error ?? incomingResult.error ?? sentResult.error;
  if (error) {
    console.error("friends:", error);
    return apiError("Internal server error", 500, "FRIENDS_FETCH_FAILED");
  }

  const legacy = legacyFriendsResultSchema.safeParse(legacyResult.data);
  const accepted = acceptedFriendshipRowsSchema.safeParse(acceptedResult.data);
  const incoming = incomingFriendshipRowsSchema.safeParse(incomingResult.data);
  const sent = sentFriendshipRowsSchema.safeParse(sentResult.data);
  if (
    !legacy.success
    || !accepted.success
    || !incoming.success
    || !sent.success
    || hasDuplicateIds([
      ...(accepted.success ? accepted.data : []),
      ...(incoming.success ? incoming.data : []),
      ...(sent.success ? sent.data : []),
    ])
    || (accepted.success && accepted.data.some((row) =>
      Number(row.requester_id === user.id) + Number(row.addressee_id === user.id) !== 1
      || row.requester.id !== row.requester_id
      || row.addressee.id !== row.addressee_id))
    || (incoming.success && incoming.data.some((row) =>
      row.addressee_id !== user.id || row.requester.id !== row.requester_id))
    || (sent.success && (
      sent.data.some((row) => row.requester_id !== user.id || row.addressee.id !== row.addressee_id)
      || new Set(sent.data.map((row) => row.addressee_id)).size !== sent.data.length
    ))
    || (accepted.success && incoming.success && sent.success
      && hasDuplicatePeers(user.id, accepted.data, incoming.data, sent.data))
  ) {
    console.error("friends: invalid database result");
    return apiError("Internal server error", 500, "FRIENDS_FETCH_FAILED");
  }

  const legacyRolesByPeerId = new Map(
    legacy.data.friends.map((friend) => [friend.id, friend.roles] as const),
  );
  const friends = accepted.data.map((row) => {
    const peerId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
    const peerRoles = legacyRolesByPeerId.get(peerId);
    return {
      ...row,
      ...(row.requester_id === peerId && peerRoles
        ? { requester: { ...row.requester, roles: peerRoles } }
        : {}),
      ...(row.addressee_id === peerId && peerRoles
        ? { addressee: { ...row.addressee, roles: peerRoles } }
        : {}),
    };
  });
  const requests = incoming.data;
  const sentRequests = sent.data;
  const page = cursorPage(request, friends, (item) => item.id, (item) => item.requested_at);
  if (page.error) return page.error;
  const requestPage = cursorPage(request, requests, (item) => item.id, (item) => item.requested_at);
  const sentPage = cursorPage(request, sentRequests, (item) => item.id, (item) => item.requested_at);
  if (requestPage.error) return requestPage.error;
  if (sentPage.error) return sentPage.error;
  const response = friendsReadResponseSchema.safeParse({
    viewer_id: user.id,
    friends: page.data?.items ?? [],
    requests: requestPage.data?.items ?? [],
    sentRequests: sentPage.data?.items ?? [],
    sentRequestUserIds: (sentPage.data?.items ?? []).map((item) => item.addressee_id),
    pagination: {
      friends: page.data?.page,
      requests: requestPage.data?.page,
      sentRequests: sentPage.data?.page,
    },
  });
  if (!response.success) {
    console.error("friends: invalid response DTO");
    return apiError("Internal server error", 500, "FRIENDS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth(async (request, { user }) => {
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const [body, err] = await parseBody(request, friendRequestSchema);
  if (err) return err;

  const serviceClient = createServiceClient();
  const requestHash = friendRequestHash(user.id, body);
  const { data: existingRaw, error: existingError } = await serviceClient
    .from("idempotency_records")
    .select("request_hash, response_status, response_body, response_retry_after_seconds")
    .eq("actor_id", user.id)
    .eq("operation", FRIEND_REQUEST_CREATE_OPERATION)
    .eq("key", idempotency.key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingError) {
    console.error("friends: idempotency preflight unavailable", existingError);
    return idempotencyError(
      idempotency.key,
      "Friend request service temporarily unavailable",
      503,
      "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  if (existingRaw) {
    const existing = friendRequestIdempotencyRecordSchema.safeParse(existingRaw);
    if (
      !existing.success
      || existing.data.response_status === null
      || existing.data.response_body === null
      || !hasValidRetryAfter(
        existing.data.response_status,
        existing.data.response_retry_after_seconds,
      )
    ) {
      console.error("friends: invalid or incomplete idempotency record");
      return idempotencyError(
        idempotency.key,
        "Friend request service temporarily unavailable",
        503,
        "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    if (existing.data.request_hash !== requestHash) {
      return idempotencyError(
        idempotency.key,
        "Idempotency key was already used for a different request",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const storedBody = parseFriendRequestResponse(
      existing.data.response_status,
      existing.data.response_body,
      user.id,
      body.addressee_id,
    );
    if (!storedBody) {
      console.error("friends: invalid stored idempotency response");
      return idempotencyError(
        idempotency.key,
        "Friend request service temporarily unavailable",
        503,
        "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
      );
    }
    return idempotentResponse(
      existing.data.response_status,
      storedBody,
      idempotency.key,
      true,
      existing.data.response_retry_after_seconds,
    );
  }

  // Every copy reaches the atomic RPC. Existing keys replay first; unseen keys
  // serialize on the bounded actor+operation bucket and are durably claimed
  // only when admitted. Denials reuse the bucket's deterministic 429.
  const { data, error } = await serviceClient.rpc("send_friend_request_idempotent", {
    p_actor_id: user.id,
    p_addressee_id: body.addressee_id,
    p_operation: FRIEND_REQUEST_CREATE_OPERATION,
    p_idempotency_key: idempotency.key,
    p_request_hash: requestHash,
    p_request_id: currentRequestId() ?? null,
  });

  if (error) {
    console.error("friends: idempotent RPC unavailable", error);
    return idempotencyError(
      idempotency.key,
      "Friend request service temporarily unavailable",
      503,
      "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    );
  }

  const result = friendRequestRpcResultSchema.safeParse(data);
  if (
    !result.success
    || !hasValidRetryAfter(
      result.data.response_status,
      result.data.retry_after_seconds,
    )
  ) {
    console.error("friends: invalid idempotent RPC result");
    return idempotencyError(
      idempotency.key,
      "Friend request service temporarily unavailable",
      503,
      "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  const responseBody = parseFriendRequestResponse(
    result.data.response_status,
    result.data.response_body,
    user.id,
    body.addressee_id,
  );
  if (!responseBody) {
    console.error("friends: invalid idempotent response DTO");
    return idempotencyError(
      idempotency.key,
      "Friend request service temporarily unavailable",
      503,
      "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE",
    );
  }
  return idempotentResponse(
    result.data.response_status,
    responseBody,
    idempotency.key,
    result.data.replayed,
    result.data.retry_after_seconds,
  );
});
