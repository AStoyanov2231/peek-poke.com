import { NextResponse } from "next/server";
import {
  API_VERSION,
  decodeCursor,
  messageCreateSchema,
  roomReadReceiptResponseSchema,
  roomMessageMutationResponseSchema,
  roomMessageSchema,
} from "@peekpoke/shared";
import { z } from "zod";
import { withAuth, verifyRoomMembership } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { idempotencyKey, mapRoomMessage, parseContractPagination } from "@/lib/api-contract";
import { loadRoomSummary } from "@/lib/room-server";
import { parseBody } from "@/lib/validators";
import { isValidUUID } from "@/lib/validation";
import { notifyRoomMessagesChanged, notifyRoomUnreadChanged } from "@/lib/realtime-broadcast";
import {
  finalizeDescendingSequenceMessagePage,
  olderThanSequenceMessageCursor,
} from "@/lib/message-history";

const rawRoomMessageResponseSchema = z.strictObject({
  message: z.record(z.string(), z.unknown()),
  deduplicated: z.boolean(),
});

const roomMessageErrorSchema = z.strictObject({
  error: z.enum(["ROOM_NOT_FOUND", "ACCOUNT_DELETED", "REPLY_TARGET_NOT_FOUND"]),
});

const roomReadDeniedResponseSchema = z.strictObject({
  error: z.literal("ROOM_NOT_FOUND"),
});

const ROOM_MESSAGE_COLUMNS = [
  "id",
  "room_id",
  "sender_id",
  "client_id",
  "sequence",
  "content",
  "message_type",
  "media_url",
  "media_thumbnail_url",
  "is_read",
  "is_edited",
  "is_deleted",
  "created_at",
  "reply_to_id",
  "sender:profiles!sender_id(id, username, display_name, avatar_url)",
].join(", ");

function roomFailure() {
  return apiError("Room temporarily unavailable", 503, "ROOM_UNAVAILABLE");
}

export const GET = withAuth<{ roomId: string }>(async (request, { user, supabase, params }) => {
  const { roomId } = params;
  if (!isValidUUID(roomId)) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  try {
    const { data: membership, error: membershipError } = await supabase
      .from("chat_room_members")
      .select("room_id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) {
      console.error("rooms/messages: membership read failed");
      return roomFailure();
    }
    if (!membership) return apiError("Room not found", 404, "ROOM_NOT_FOUND");

    const pagination = parseContractPagination(request);
    if (pagination.error) return pagination.error;
    const decodedCursor = pagination.data.cursor ? decodeCursor(pagination.data.cursor) : null;
    const sequenceCursor = decodedCursor ? olderThanSequenceMessageCursor(decodedCursor) : null;
    if (decodedCursor && !sequenceCursor) {
      return apiError("Invalid cursor", 400, "INVALID_CURSOR");
    }
    const service = createServiceClient();
    let query = supabase
      .from("chat_room_messages")
      .select(ROOM_MESSAGE_COLUMNS)
      .eq("room_id", roomId)
      .order("sequence", { ascending: false })
      .limit(pagination.data.limit + 1);
    if (sequenceCursor) query = query.or(sequenceCursor);
    const { data: rows, error } = await query;
    if (error) {
      console.error("rooms/messages: read failed");
      return roomFailure();
    }

    const page = finalizeDescendingSequenceMessagePage(
      (rows ?? []) as unknown as Array<{ id: string; sequence: number; [key: string]: unknown }>,
      pagination.data.limit,
    );
    const messages = page.items.map(mapRoomMessage).reverse();
    const parsedMessages = z.array(roomMessageSchema).safeParse(messages);
    if (!parsedMessages.success) {
      console.error("rooms/messages: malformed message response");
      return roomFailure();
    }

    if (!sequenceCursor) {
      const maxLoadedSequence = parsedMessages.data.reduce(
        (maxSequence, message) => Math.max(maxSequence, message.sequence ?? 0),
        0,
      );
      const { data: readResult, error: readError } = await service.rpc("mark_chat_room_read", {
        p_room_id: roomId,
        p_user_id: user.id,
        p_max_sequence: maxLoadedSequence,
      });
      if (readError) {
        console.error("rooms/messages: read receipt update failed");
        return roomFailure();
      }
      if (roomReadDeniedResponseSchema.safeParse(readResult).success) {
        return apiError("Room not found", 404, "ROOM_NOT_FOUND");
      }
      const parsedReadReceipt = roomReadReceiptResponseSchema.safeParse(readResult);
      if (!parsedReadReceipt.success) {
        console.error("rooms/messages: malformed read receipt response");
        return roomFailure();
      }
      if (parsedReadReceipt.data.advanced) {
        const sequence = parsedReadReceipt.data.last_read_sequence > 0
          ? parsedReadReceipt.data.last_read_sequence
          : undefined;
        await notifyRoomMessagesChanged(roomId, "read", user.id, sequence);
        await notifyRoomUnreadChanged(roomId, "read", user.id, sequence);
      }
    }
    const loaded = await loadRoomSummary(roomId, supabase);
    if (loaded.error || !loaded.summary) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
    return NextResponse.json({
      room: loaded.summary,
      messages: parsedMessages.data,
      pagination: {
        version: API_VERSION,
        next_cursor: page.nextCursor,
        has_more: page.hasMore,
        limit: pagination.data.limit,
      },
    });
  } catch (error) {
    console.error("rooms/messages: unexpected read failure", error instanceof Error ? error.name : "unknown");
    return roomFailure();
  }
});

export const POST = withAuth<{ roomId: string }>(async (request, { user, params }) => {
  const { roomId } = params;
  if (!isValidUUID(roomId)) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  const [message, bodyError] = await parseBody(request, messageCreateSchema);
  if (bodyError) return bodyError;
  if (message.client_id !== idempotency.key) {
    return apiError("Idempotency key does not match client ID", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  const limited = await enforceRateLimit("roomMessage", user.id);
  if (limited) return limited;
  let membership;
  try {
    membership = await verifyRoomMembership(roomId, user.id);
  } catch (error) {
    console.error("rooms/messages: membership verification failed", error instanceof Error ? error.name : "unknown");
    return roomFailure();
  }
  if (!membership) return apiError("Room not found", 404, "ROOM_NOT_FOUND");

  // Room media will use the same private-media claim path once room uploads
  // are introduced. Rejecting it here avoids accepting an unverified URL.
  if (message.message_type !== "text" || message.media_url || message.media_thumbnail_url) {
    return apiError("Only text messages are supported in rooms", 400, "ROOM_MESSAGE_INVALID");
  }

  const { data, error } = await createServiceClient().rpc("send_room_message_transactional", {
    p_room_id: roomId,
    p_sender_id: user.id,
    p_client_id: message.client_id,
    p_content: message.content,
    p_message_type: "text",
    p_media_url: null,
    p_media_thumbnail_url: null,
    p_reply_to_id: message.reply_to_id ?? null,
  });
  if (error) {
    console.error("rooms/messages: send failed");
    return roomFailure();
  }
  const denial = roomMessageErrorSchema.safeParse(data);
  if (denial.success) {
    if (denial.data.error === "REPLY_TARGET_NOT_FOUND") {
      return apiError("Reply target not found", 400, "ROOM_MESSAGE_INVALID");
    }
    return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  }
  const result = rawRoomMessageResponseSchema.safeParse(data);
  if (!result.success) {
    console.error("rooms/messages: malformed send response");
    return roomFailure();
  }
  const mapped = mapRoomMessage(result.data.message);
  const parsed = roomMessageMutationResponseSchema.safeParse({ message: mapped });
  if (!parsed.success || mapped.room_id !== roomId || mapped.sender_id !== user.id || mapped.client_id !== message.client_id) {
    console.error("rooms/messages: send response did not match request");
    return roomFailure();
  }
  await notifyRoomMessagesChanged(roomId, "sent", user.id, mapped.sequence);
  await notifyRoomUnreadChanged(roomId, "sent", user.id, mapped.sequence);
  return NextResponse.json(parsed.data, { headers: { "idempotency-key": message.client_id } });
});
