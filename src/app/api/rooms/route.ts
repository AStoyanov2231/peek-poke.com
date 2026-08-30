import { NextResponse } from "next/server";
import {
  roomCreateRequestSchema,
  roomCreateResponseSchema,
  roomJoinResponseSchema,
  roomsResponseSchema,
  type RoomSummary,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cursorPage } from "@/lib/api-contract";
import { loadRoomSummary } from "@/lib/room-server";
import { parseBody } from "@/lib/validators";

const roomCreateRpcSchema = roomCreateResponseSchema.pick({ qr_payload: true }).extend({
  room_id: roomCreateResponseSchema.shape.room.shape.id,
});

function roomFailure(code = "ROOMS_UNAVAILABLE") {
  return apiError("Rooms temporarily unavailable", 503, code);
}

export const GET = withAuth(async (request, { user }) => {
  const service = createServiceClient();
  const { data: memberships, error: membershipError } = await service
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", user.id);
  if (membershipError) {
    console.error("rooms: membership read failed");
    return roomFailure();
  }

  const roomIds = [...new Set((memberships ?? [])
    .map((membership) => membership.room_id)
    .filter((roomId): roomId is string => typeof roomId === "string"))];
  if (roomIds.length === 0) {
    const emptyRooms: RoomSummary[] = [];
    const page = cursorPage(request, emptyRooms, (room) => room.id, (room) => room.created_at);
    if (page.error) return page.error;
    return NextResponse.json({ rooms: [], pagination: page.data.page });
  }

  const loadedRooms = await Promise.all(roomIds.map((roomId) => loadRoomSummary(roomId, user.id)));
  if (loadedRooms.some((loaded) => loaded.error)) {
    console.error("rooms: room summary read failed");
    return roomFailure();
  }
  const rooms = loadedRooms.flatMap((loaded) => loaded.summary ? [loaded.summary] : []);
  const page = cursorPage(request, rooms, (room) => room.id, (room) => room.last_message_at ?? room.created_at);
  if (page.error) return page.error;
  const response = roomsResponseSchema.safeParse({ rooms: page.data.items, pagination: page.data.page });
  if (!response.success) {
    console.error("rooms: malformed list response");
    return roomFailure("ROOMS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth(async (request, { user }) => {
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
  const loaded = await loadRoomSummary(parsed.data.room_id, user.id);
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

