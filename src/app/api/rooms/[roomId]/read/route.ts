import { NextResponse } from "next/server";
import { readReceiptResponseSchema } from "@peekpoke/shared";
import { withAuth, verifyRoomMembership } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { notifyRoomMessagesChanged } from "@/lib/realtime-broadcast";
import { z } from "zod";

const roomReadResponseSchema = z.strictObject({
  success: z.literal(true),
  last_read_sequence: z.number().int().nonnegative(),
});

export const POST = withAuth<{ roomId: string }>(async (_request, { user, params }) => {
  const { roomId } = params;
  if (!isValidUUID(roomId)) return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  const membership = await verifyRoomMembership(roomId, user.id);
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
  const parsed = roomReadResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error("rooms/read: malformed response");
    return apiError("Room read state unavailable", 503, "ROOM_READ_UNAVAILABLE");
  }
  const response = readReceiptResponseSchema.safeParse(parsed.data);
  if (!response.success) return apiError("Room read state unavailable", 503, "ROOM_READ_UNAVAILABLE");
  await notifyRoomMessagesChanged(
    roomId,
    "read",
    user.id,
    response.data.last_read_sequence > 0 ? response.data.last_read_sequence : undefined,
  );
  return NextResponse.json(response.data);
});
