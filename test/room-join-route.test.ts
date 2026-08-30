import { beforeEach, describe, expect, it, vi } from "vitest";
import { roomJoinResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const QR_PAYLOAD = "pp-room-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));
const summary = {
  id: ROOM_ID,
  name: "Group room",
  created_at: "2026-08-14T09:00:00.000Z",
  last_message_at: null,
  last_message_preview: null,
  member_count: 2,
  unread_count: 0,
};

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));
vi.mock("@/lib/room-server", () => ({
  loadRoomSummary: vi.fn(async () => ({ summary, error: null })),
}));

import { POST } from "@/app/api/rooms/join/route";

function request(body: unknown) {
  return POST(new Request("http://localhost/api/rooms/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/rooms/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockResolvedValue({
      data: { room_id: ROOM_ID, is_new_member: true },
      error: null,
    });
  });

  it("resolves a valid QR capability to a room without echoing it", async () => {
    const response = await request({ qr_payload: QR_PAYLOAD });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(roomJoinResponseSchema.parse(payload)).toEqual(payload);
    expect(payload).toEqual({ room: summary, is_new_member: true });
    expect(JSON.stringify(payload)).not.toContain(QR_PAYLOAD);
  });

  it("rejects malformed capabilities before touching the database", async () => {
    const response = await request({ qr_payload: "ROOM_ID" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("maps an unknown capability without leaking its value", async () => {
    database.rpc.mockResolvedValue({ data: { error: "ROOM_NOT_FOUND" }, error: null });
    const response = await request({ qr_payload: QR_PAYLOAD });
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.code).toBe("ROOM_NOT_FOUND");
    expect(JSON.stringify(payload)).not.toContain(QR_PAYLOAD);
  });
});
