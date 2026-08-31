import { NextResponse } from "next/server";
import { readReceiptResponseSchema, roomReadReceiptResponseSchema } from "@peekpoke/shared";
import { withAuth, verifyRoomMembership } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { notifyRoomMessagesChanged, notifyRoomUnreadChanged } from "@/lib/realtime-broadcast";

export const POST = withAuth<{ roomId: string }>(async (_request, { user, params }) => {
  const { roomId } = params;
  if (!isValidUUID(roomId)) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  let membership;
  try {
    membership = await verifyRoomMembership(roomId, user.id);
  } catch (error) {
    console.error("rooms/read: membership verification failed", error instanceof Error ? error.name : "unknown");
    return apiError("Room temporarily unavailable", 503, "ROOM_UNAVAILABLE");
  }
  if (!membership) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  const { data, error } = await createServiceClient().rpc("mark_chat_room_read", {
    p_room_id: roomId,
    p_user_id: user.id,
    p_max_sequence: null,
  });
  if (error) {
    console.error("rooms/read: update failed");
    return apiError("Room read state unavailable", 503, "ROOM_READ_UNAVAILABLE");
  }
  if (data && typeof data === "object" && "error" in data) {
    return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  }
  const parsed = roomReadReceiptResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error("rooms/read: malformed response");
    return apiError("Room read state unavailable", 503, "ROOM_READ_UNAVAILABLE");
  }
  const response = readReceiptResponseSchema.parse({
    success: parsed.data.success,
    last_read_sequence: parsed.data.last_read_sequence,
  });
  if (parsed.data.advanced) {
    const sequence = response.last_read_sequence > 0 ? response.last_read_sequence : undefined;
    await notifyRoomMessagesChanged(roomId, "read", user.id, sequence);
    await notifyRoomUnreadChanged(roomId, "read", user.id, sequence);
  }
  return NextResponse.json(response);
});
