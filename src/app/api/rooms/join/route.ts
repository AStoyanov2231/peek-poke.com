import { NextResponse } from "next/server";
import {
  roomJoinRequestSchema,
  roomJoinResponseSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadRoomSummary } from "@/lib/room-server";
import { parseBody } from "@/lib/validators";
import { isValidUUID } from "@/lib/validation";
import { notifyRoomMembershipChanged } from "@/lib/realtime-broadcast";
import { z } from "zod";

const roomJoinRpcSchema = z.strictObject({
  room_id: z.uuid(),
  is_new_member: z.boolean(),
});

const roomJoinErrorSchema = z.strictObject({
  error: z.enum(["INVALID_QR_PAYLOAD", "ROOM_NOT_FOUND", "ACCOUNT_DELETED"]),
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const limited = await enforceRateLimit("roomJoin", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(request, roomJoinRequestSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("join_chat_room_by_qr", {
    p_user_id: user.id,
    p_qr_payload: body.qr_payload,
  });
  if (error) {
    // The payload is intentionally not included in logs or error responses.
    console.error("rooms/join: join failed");
    return apiError("Room could not be joined", 503, "ROOM_JOIN_FAILED");
  }
  const denial = roomJoinErrorSchema.safeParse(data);
  if (denial.success) {
    if (denial.data.error === "INVALID_QR_PAYLOAD") {
      return apiError("Invalid room QR code", 400, "INVALID_ROOM_QR");
    }
    return apiError("Room not found", 404, "ROOM_NOT_FOUND");
  }
  const result = roomJoinRpcSchema.safeParse(data);
  if (!result.success || !isValidUUID(result.data.room_id)) {
    console.error("rooms/join: malformed join response");
    return apiError("Room could not be joined", 503, "ROOM_JOIN_FAILED");
  }

  const loaded = await loadRoomSummary(result.data.room_id, supabase);
  if (loaded.error) {
    console.error("rooms/join: room requery failed");
    return apiError("Room could not be joined", 503, "ROOM_JOIN_FAILED");
  }
  if (!loaded.summary) return apiError("Room not found", 404, "ROOM_NOT_FOUND");

  const response = roomJoinResponseSchema.safeParse({
    room: loaded.summary,
    is_new_member: result.data.is_new_member,
  });
  if (!response.success) {
    console.error("rooms/join: malformed public response");
    return apiError("Room could not be joined", 503, "ROOM_JOIN_FAILED");
  }
  await notifyRoomMembershipChanged(result.data.room_id);
  return NextResponse.json(response.data);
});
