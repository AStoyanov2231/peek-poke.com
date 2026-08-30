import {
  boundedCursorPath,
  roomCreateResponseSchema,
  roomJoinRequestSchema,
  roomJoinResponseSchema,
  roomMessageMutationResponseSchema,
  roomMessagesResponseSchema,
  roomsResponseSchema,
  type RoomCreateResponse,
  type RoomJoinResponse,
  type RoomMessagesResponse,
  type RoomMessageMutationResponse,
  type RoomsResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export async function fetchRooms(signal?: AbortSignal): Promise<RoomsResponse> {
  const rooms: RoomsResponse["rooms"] = [];
  let cursor: string | null = null;
  let pagination: RoomsResponse["pagination"] | null = null;

  while (true) {
    const page = await apiFetch(
      boundedCursorPath("/api/rooms", cursor),
      { signal, responseSchema: roomsResponseSchema },
    );
    rooms.push(...page.rooms);
    pagination = page.pagination;
    if (!page.pagination.has_more) break;
    const nextCursor = page.pagination.next_cursor;
    if (!nextCursor || nextCursor === cursor) throw new Error("Invalid room pagination cursor");
    cursor = nextCursor;
  }

  return {
    rooms,
    pagination: { ...pagination!, next_cursor: null, has_more: false },
  };
}

export function createRoom(): Promise<RoomCreateResponse> {
  return apiFetch("/api/rooms", {
    method: "POST",
    body: jsonBody({}),
    responseSchema: roomCreateResponseSchema,
  });
}

export function joinRoom(qrPayload: string): Promise<RoomJoinResponse> {
  const body = roomJoinRequestSchema.parse({ qr_payload: qrPayload.trim() });
  return apiFetch("/api/rooms/join", {
    method: "POST",
    body: jsonBody(body),
    responseSchema: roomJoinResponseSchema,
  });
}

export function fetchRoomMessages(
  roomId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<RoomMessagesResponse> {
  return apiFetch(
    boundedCursorPath(`/api/rooms/${encodeURIComponent(roomId)}/messages`, cursor),
    { signal, responseSchema: roomMessagesResponseSchema },
  );
}

export function sendRoomMessage(roomId: string, content: string, clientId: string): Promise<RoomMessageMutationResponse> {
  return apiFetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: "POST",
    headers: { "idempotency-key": clientId },
    body: jsonBody({ client_id: clientId, content, message_type: "text" }),
    responseSchema: roomMessageMutationResponseSchema,
  });
}
