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
import { infiniteQueryOptions } from "@tanstack/react-query";
import { apiFetch, jsonBody } from "@/lib/api";
import { nativeQueryKeys } from "@/data/query-keys";

export function fetchRooms(cursor: string | null = null, signal?: AbortSignal): Promise<RoomsResponse> {
  return apiFetch(boundedCursorPath("/api/rooms", cursor), { signal, responseSchema: roomsResponseSchema });
}

export const roomsQueryOptions = infiniteQueryOptions({
  queryKey: nativeQueryKeys.rooms.list,
  queryFn: ({ pageParam, signal }) => fetchRooms(pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.pagination.has_more
    ? lastPage.pagination.next_cursor ?? undefined
    : undefined,
  staleTime: 10_000,
});

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
