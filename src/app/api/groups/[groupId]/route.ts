import { NextResponse } from "next/server";
import { z } from "zod";
import {
  idempotencyKeySchema,
  messageSchema,
  sharedGroupMessageCreateSchema,
  sharedGroupMessagesResponseSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import {
  idempotencyKey,
  parseContractPagination,
} from "@/lib/api-contract";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import {
  getSharedGroupMembership,
  getSharedGroupSummary,
  mapSharedGroupMessage,
  SHARED_GROUP_MESSAGE_COLUMNS,
} from "@/lib/shared-groups";
import { parseBody } from "@/lib/validators";
import { decodeCursor } from "@peekpoke/shared";
import { finalizeDescendingMessagePage, olderThanMessageCursor } from "@/lib/message-history";

const groupMessageRpcSchema = z.strictObject({
  message: z.unknown(),
  deduplicated: z.boolean(),
});
const groupMessageRpcErrorSchema = z.strictObject({
  error: z.enum([
    "GROUP_NOT_FOUND",
    "ACCOUNT_NOT_ACTIVE",
    "INVALID_MESSAGE",
    "IDEMPOTENCY_KEY_REUSED",
  ]),
});

export const GET = withAuth<{ groupId: string }>(async (request, { user, params }) => {
  const { groupId } = params;
  if (!isValidUUID(groupId)) return apiError("Group not found", 404, "GROUP_NOT_FOUND");

  const service = createServiceClient();
  let membership: Awaited<ReturnType<typeof getSharedGroupMembership>>;
  try {
    membership = await getSharedGroupMembership(service, groupId, user.id);
  } catch (error) {
    console.error("groups/[groupId]: membership check failed", error);
    return apiError("Group messages are temporarily unavailable", 503, "GROUP_MESSAGES_FETCH_FAILED");
  }
  if (!membership) return apiError("Group not found", 404, "GROUP_NOT_FOUND");
  const lastReadSequence = Number(membership.last_read_sequence ?? 0);
  let group: Awaited<ReturnType<typeof getSharedGroupSummary>>;
  try {
    group = await getSharedGroupSummary(service, groupId, lastReadSequence);
  } catch (error) {
    console.error("groups/[groupId]: summary failed", error);
    return apiError("Group messages are temporarily unavailable", 503, "GROUP_MESSAGES_FETCH_FAILED");
  }
  if (!group) return apiError("Group not found", 404, "GROUP_NOT_FOUND");

  const pagination = parseContractPagination(request);
  if (pagination.error) return pagination.error;
  const decodedCursor = pagination.data.cursor ? decodeCursor(pagination.data.cursor) : null;
  let query = service
    .from("shared_group_messages")
    .select(SHARED_GROUP_MESSAGE_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pagination.data.limit + 1);
  if (decodedCursor) query = query.or(olderThanMessageCursor(decodedCursor));
  const { data: rows, error } = await query;
  if (error) {
    console.error("groups/[groupId]: messages failed", error);
    return apiError("Group messages are temporarily unavailable", 503, "GROUP_MESSAGES_FETCH_FAILED");
  }

  const page = finalizeDescendingMessagePage(
    (rows ?? []) as unknown as Array<{ id: string; created_at: string }>,
    pagination.data.limit,
  );
  const messages = page.items
    .map((row) => mapSharedGroupMessage(row, groupId, lastReadSequence))
    .reverse();
  const response = sharedGroupMessagesResponseSchema.safeParse({
    group,
    messages,
    pagination: {
      version: "v1",
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
      limit: pagination.data.limit,
    },
  });
  if (!response.success) {
    console.error("groups/[groupId]: malformed messages response");
    return apiError("Group messages are temporarily unavailable", 503, "GROUP_MESSAGES_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth<{ groupId: string }>(async (request, { user, params }) => {
  const { groupId } = params;
  if (!isValidUUID(groupId)) return apiError("Group not found", 404, "GROUP_NOT_FOUND");
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key || !idempotencyKeySchema.safeParse(idempotency.key).success) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  const [body, parseError] = await parseBody(request, sharedGroupMessageCreateSchema);
  if (parseError) return parseError;
  if (body.client_id !== idempotency.key) {
    return apiError("Idempotency key does not match client ID", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  const limited = await enforceRateLimit("sendMessage", user.id);
  if (limited) return limited;

  const { data, error } = await createServiceClient().rpc("send_shared_group_message_transactional", {
    p_group_id: groupId,
    p_sender_id: user.id,
    p_client_id: body.client_id,
    p_content: body.content,
  });
  if (error) {
    console.error("groups/[groupId]: message send failed", error);
    return apiError("Message sending temporarily unavailable", 503, "GROUP_MESSAGE_SEND_FAILED");
  }
  const denial = groupMessageRpcErrorSchema.safeParse(data);
  if (denial.success) {
    if (denial.data.error === "GROUP_NOT_FOUND") return apiError("Group not found", 404, "GROUP_NOT_FOUND");
    if (denial.data.error === "IDEMPOTENCY_KEY_REUSED") return apiError("Message attempt was already used", 409, "IDEMPOTENCY_KEY_REUSED");
    if (denial.data.error === "INVALID_MESSAGE") return apiError("Message cannot be empty", 400, "MESSAGE_SEND_FAILED");
    return apiError("Cannot send message", 403, "MESSAGE_SEND_FAILED");
  }
  const parsed = groupMessageRpcSchema.safeParse(data);
  if (!parsed.success) {
    console.error("groups/[groupId]: malformed message RPC response");
    return apiError("Message sending temporarily unavailable", 503, "GROUP_MESSAGE_SEND_FAILED");
  }
  const message = messageSchema.safeParse(mapSharedGroupMessage(parsed.data.message, groupId));
  if (!message.success) {
    console.error("groups/[groupId]: malformed message response");
    return apiError("Message sending temporarily unavailable", 503, "GROUP_MESSAGE_SEND_FAILED");
  }
  return NextResponse.json({ message: message.data }, {
    headers: { "idempotency-key": body.client_id },
  });
});
