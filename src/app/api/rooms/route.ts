import { NextResponse } from "next/server";
import {
  API_VERSION,
  decodeCursor,
  encodeCursor,
  roomCreateRequestSchema,
  roomCreateResponseSchema,
  roomSummarySchema,
  roomsResponseSchema,
} from "@peekpoke/shared";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseContractPagination } from "@/lib/api-contract";
import { loadRoomSummary } from "@/lib/room-server";
import { parseBody } from "@/lib/validators";
import { isValidUUID } from "@/lib/validation";

const roomCreateRpcSchema = roomCreateResponseSchema.pick({ qr_payload: true }).extend({
  room_id: roomCreateResponseSchema.shape.room.shape.id,
});

function roomFailure(code = "ROOMS_UNAVAILABLE") {
  return apiError("Rooms temporarily unavailable", 503, code);
}

export const GET = withAuth(async (request, { supabase }) => {
  const pagination = parseContractPagination(request);
  if (pagination.error) return pagination.error;
  const decodedCursor = pagination.data.cursor ? decodeCursor(pagination.data.cursor) : null;
  if (decodedCursor && (
    !isValidUUID(decodedCursor.id)
    || Number.isNaN(Date.parse(decodedCursor.sort_value))
  )) {
    return apiError("Invalid cursor", 400, "INVALID_CURSOR");
  }

  const { data: rawRooms, error } = await supabase.rpc("list_chat_room_summaries", {
    p_limit: pagination.data.limit + 1,
    p_cursor_at: decodedCursor ? new Date(decodedCursor.sort_value).toISOString() : null,
    p_cursor_id: decodedCursor?.id ?? null,
  });
  if (error) {
    console.error("rooms: room list read failed");
    return roomFailure();
  }
  const parsedRooms = z.array(roomSummarySchema).safeParse(rawRooms ?? []);
  if (!parsedRooms.success) {
    console.error("rooms: malformed list response");
    return roomFailure("ROOMS_FETCH_FAILED");
  }
  const hasMore = parsedRooms.data.length > pagination.data.limit;
  const rooms = parsedRooms.data.slice(0, pagination.data.limit);
  const lastRoom = rooms.at(-1);
  const nextCursor = hasMore && lastRoom
    ? encodeCursor({
      sort_value: lastRoom.last_message_at ?? lastRoom.created_at,
      id: lastRoom.id,
    })
    : null;
  const response = roomsResponseSchema.safeParse({
    rooms,
    pagination: {
      version: API_VERSION,
      next_cursor: nextCursor,
      has_more: hasMore,
      limit: pagination.data.limit,
    },
  });
  if (!response.success) {
    console.error("rooms: malformed list response");
    return roomFailure("ROOMS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const limited = await enforceRateLimit("roomCreate", user.id);
  if (limited) return limited;
  const [body, bodyError] = await parseBody(request, roomCreateRequestSchema);
  if (bodyError) return bodyError;
  void body;

  const service = createServiceClient();
  const { data, error } = await service.rpc("create_chat_room", { p_user_id: user.id });
  if (error) {
    console.error("rooms: create failed");
    return roomFailure("ROOM_CREATE_FAILED");
  }
  const parsed = roomCreateRpcSchema.safeParse(data);
  if (!parsed.success) {
    // In particular, do not log or echo a malformed capability.
    console.error("rooms: malformed create response");
    return roomFailure("ROOM_CREATE_FAILED");
  }
  const loaded = await loadRoomSummary(parsed.data.room_id, supabase);
  if (loaded.error || !loaded.summary) {
    console.error("rooms: created room could not be loaded");
    return roomFailure("ROOM_CREATE_FAILED");
  }
  const response = roomCreateResponseSchema.safeParse({
    room: loaded.summary,
    qr_payload: parsed.data.qr_payload,
  });
  if (!response.success) return roomFailure("ROOM_CREATE_FAILED");
  return NextResponse.json(response.data);
});
