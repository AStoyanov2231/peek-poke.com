"use client";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  boundedCursorPath,
  roomCreateResponseSchema,
  roomJoinRequestSchema,
  roomJoinResponseSchema,
  roomMessagesResponseSchema,
  roomsResponseSchema,
  roomMessageMutationResponseSchema,
  type RoomCreateResponse,
  type RoomJoinResponse,
  type RoomMessagesResponse,
  type RoomsResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import { webQueryKeys } from "@/data/web-query";

export async function fetchRooms(signal?: AbortSignal): Promise<RoomsResponse> {
  const rooms: RoomsResponse["rooms"] = [];
  let cursor: string | null = null;
  let pagination: RoomsResponse["pagination"] | null = null;

  while (true) {
    const page = await fetchContract(
      boundedCursorPath("/api/rooms", cursor),
      roomsResponseSchema,
      { signal },
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

export const roomsQueryOptions = queryOptions({
  queryKey: webQueryKeys.rooms,
  queryFn: ({ signal }) => fetchRooms(signal),
  staleTime: 10_000,
});

export function createRoom(): Promise<RoomCreateResponse> {
  return fetchContract("/api/rooms", roomCreateResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export function joinRoom(qrPayload: string): Promise<RoomJoinResponse> {
  const body = roomJoinRequestSchema.parse({ qr_payload: qrPayload.trim() });
  return fetchContract("/api/rooms/join", roomJoinResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sendRoomMessage(roomId: string, content: string, clientId: string) {
  return fetchContract(`/api/rooms/${encodeURIComponent(roomId)}/messages`, roomMessageMutationResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": clientId,
    },
    body: JSON.stringify({ client_id: clientId, content, message_type: "text" }),
  });
}

export function fetchRoomMessages(
  roomId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<RoomMessagesResponse> {
  return fetchContract(
    boundedCursorPath(`/api/rooms/${encodeURIComponent(roomId)}/messages`, cursor),
    roomMessagesResponseSchema,
    { signal },
  );
}

export const roomMessagesQueryOptions = (roomId: string) => infiniteQueryOptions({
  queryKey: webQueryKeys.roomMessages(roomId),
  queryFn: ({ pageParam, signal }) => fetchRoomMessages(roomId, pageParam, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.pagination.has_more
    ? lastPage.pagination.next_cursor ?? undefined
    : undefined,
  enabled: Boolean(roomId),
  refetchOnReconnect: false,
  staleTime: 10_000,
});
