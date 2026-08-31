import { describe, expect, it } from "vitest";
import {
  appRoutes,
  roomCreateResponseSchema,
  roomJoinRequestSchema,
  roomTableCodeSchema,
  roomMessageSchema,
  roomMessagesResponseSchema,
  roomsResponseSchema,
} from "@peekpoke/shared";
import { mapRoomMessage } from "@/lib/api-contract";

const ROOM_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const qrPayload = "pp-room-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const tableCode = "pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const timestamp = "2026-08-14T09:00:00.000Z";

const room = {
  id: ROOM_ID,
  name: "Group room",
  created_at: timestamp,
  last_message_at: null,
  last_message_preview: null,
  member_count: 2,
  unread_count: 0,
};

const message = {
  id: "33333333-3333-4333-8333-333333333333",
  room_id: ROOM_ID,
  thread_id: ROOM_ID,
  sender_id: USER_ID,
  content: "hello",
  message_type: "text" as const,
  media_url: null,
  media_thumbnail_url: null,
  is_read: false,
  is_edited: false,
  is_deleted: false,
  created_at: timestamp,
  sequence: 1,
  client_id: "44444444-4444-4444-8444-444444444444",
  reply_to_id: null,
  reply_to: null,
  sender: {
    id: USER_ID,
    username: "member",
    display_name: null,
    avatar_url: null,
  },
};

describe("QR room contracts", () => {
  it("accepts table identifiers and secondary share capabilities", () => {
    expect(roomTableCodeSchema.parse(tableCode)).toBe(tableCode);
    expect(roomJoinRequestSchema.parse({ qr_payload: tableCode }).qr_payload).toBe(tableCode);
    expect(roomJoinRequestSchema.parse({ qr_payload: qrPayload }).qr_payload).toBe(qrPayload);
    expect(roomJoinRequestSchema.safeParse({ qr_payload: "ROOM_ID" }).success).toBe(false);
    expect(roomJoinRequestSchema.safeParse({ qr_payload: `${tableCode} ` }).success).toBe(false);
  });

  it("keeps QR capabilities out of room summaries and URL identities", () => {
    expect(roomsResponseSchema.parse({
      rooms: [room],
      pagination: { version: "v1", next_cursor: null, has_more: false, limit: 20 },
    }).rooms[0]).toEqual(room);
    expect(appRoutes.room(ROOM_ID)).toBe(`/room/${ROOM_ID}`);
    expect(appRoutes.room(ROOM_ID)).not.toContain(qrPayload);
    expect(roomCreateResponseSchema.safeParse({ room, qr_payload: qrPayload }).success).toBe(true);
    expect(roomCreateResponseSchema.safeParse({ room, qr_payload: tableCode }).success).toBe(true);
  });

  it("binds every room message to its room", () => {
    expect(roomMessageSchema.parse(message).room_id).toBe(ROOM_ID);
    expect(roomMessagesResponseSchema.parse({
      room,
      messages: [message],
      pagination: { version: "v1", next_cursor: null, has_more: false, limit: 20 },
    }).messages).toHaveLength(1);
    expect(roomMessageSchema.safeParse({ ...message, thread_id: "55555555-5555-4555-8555-555555555555" }).success).toBe(false);
    expect(roomMessageSchema.safeParse({
      ...message,
      sender: { ...message.sender, is_online: true },
    }).success).toBe(false);
  });

  it("preserves the room-safe sender mapping", () => {
    const mapped = mapRoomMessage({
      ...message,
      sender: {
        ...message.sender,
        is_online: true,
        last_seen_at: timestamp,
        location_text: "Sofia",
      },
    });

    expect(mapped.sender).toEqual(message.sender);
    expect(roomMessageSchema.parse(mapped).sender).toEqual(message.sender);
  });
});
