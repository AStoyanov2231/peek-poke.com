import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  roomMessageMutationResponseSchema,
  roomMessagesResponseSchema,
} from "@peekpoke/shared";

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  roomId: "22222222-2222-4222-8222-222222222222",
  rows: [] as unknown[],
  membership: { room_id: "22222222-2222-4222-8222-222222222222", user_id: "11111111-1111-4111-8111-111111111111" } as unknown,
  roomRead: vi.fn(),
  send: vi.fn(),
  broadcast: vi.fn(async () => undefined),
}));

const summary = {
  id: state.roomId,
  name: "Group room",
  created_at: "2026-08-14T09:00:00.000Z",
  last_message_at: "2026-08-14T09:01:00.000Z",
  last_message_preview: "hello",
  member_count: 2,
  unread_count: 0,
};

const messageRow = {
  id: "33333333-3333-4333-8333-333333333333",
  room_id: state.roomId,
  sender_id: state.userId,
  client_id: "44444444-4444-4444-8444-444444444444",
  sequence: 1,
  content: "hello",
  message_type: "text",
  media_url: null,
  media_thumbnail_url: null,
  is_read: false,
  is_edited: false,
  is_deleted: false,
  created_at: "2026-08-14T09:01:00.000Z",
  reply_to_id: null,
  reply_to: null,
  sender: {
    id: state.userId,
    username: "member",
    display_name: null,
    avatar_url: null,
    location_text: "Sofia",
    is_online: true,
    last_seen_at: "2026-08-14T09:00:00.000Z",
  },
};

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: state.membership, error: null })),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

const database = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: state.userId },
      params: { roomId: state.roomId },
      supabase: { from: database.from },
    }),
  verifyRoomMembership: vi.fn(async () => state.membership),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: (name: string, args: unknown) => {
      if (name === "mark_chat_room_read") return state.roomRead(args);
      return state.send(args);
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/room-server", () => ({
  loadRoomSummary: vi.fn(async () => ({ summary, error: null })),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  notifyRoomMessagesChanged: state.broadcast,
  notifyRoomUnreadChanged: state.broadcast,
}));

import { GET, POST } from "@/app/api/rooms/[roomId]/messages/route";

function getRequest() {
  return GET(new Request(`http://localhost/api/rooms/${state.roomId}/messages`));
}

function postRequest() {
  return POST(new Request(`http://localhost/api/rooms/${state.roomId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": messageRow.client_id,
    },
    body: JSON.stringify({
      client_id: messageRow.client_id,
      content: messageRow.content,
      message_type: "text",
    }),
  }));
}

describe("room messages API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.membership = { room_id: state.roomId, user_id: state.userId };
    state.rows = [messageRow];
    database.from.mockImplementation((table: string) =>
      queryResult(table === "chat_room_members" ? state.membership : state.rows));
    state.roomRead.mockResolvedValue({
      data: { success: true, last_read_sequence: 1, advanced: true },
      error: null,
    });
    state.send.mockResolvedValue({
      data: { message: messageRow, deduplicated: false },
      error: null,
    });
  });

  it("returns room-scoped messages, advances the read cursor, and strips presence from senders", async () => {
    const response = await getRequest();
    const payload = roomMessagesResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.thread_id).toBe(state.roomId);
    expect(payload.messages[0]?.sender).toEqual({
      id: state.userId,
      username: "member",
      display_name: null,
      avatar_url: null,
    });
    expect(state.roomRead).toHaveBeenCalledWith({
      p_room_id: state.roomId,
      p_user_id: state.userId,
      p_max_sequence: 1,
    });
    expect(state.broadcast).toHaveBeenCalledTimes(2);
  });

  it("accepts a client idempotency key and returns a validated room message", async () => {
    const response = await postRequest();
    const payload = roomMessageMutationResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe(messageRow.client_id);
    expect(payload.message.room_id).toBe(state.roomId);
    expect(payload.message.sender_id).toBe(state.userId);
    expect(state.send).toHaveBeenCalledWith({
      p_room_id: state.roomId,
      p_sender_id: state.userId,
      p_client_id: messageRow.client_id,
      p_content: "hello",
      p_message_type: "text",
      p_media_url: null,
      p_media_thumbnail_url: null,
      p_reply_to_id: null,
    });
    expect(state.broadcast).toHaveBeenCalledTimes(2);
  });
});
