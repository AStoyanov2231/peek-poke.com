import { afterEach, describe, expect, it, vi } from "vitest";
import { joinRoom } from "@/data/rooms";

const ROOM_ID = "11111111-1111-4111-8111-111111111111";
const QR_PAYLOAD = "pp-room-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const TABLE_CODE = "pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const response = {
  room: {
    id: ROOM_ID,
    name: "Group room",
    created_at: "2026-08-14T09:00:00.000Z",
    last_message_at: null,
    last_message_preview: null,
    member_count: 2,
    unread_count: 0,
  },
  is_new_member: true,
};

vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })) } },
}));

afterEach(() => vi.unstubAllGlobals());

describe("native QR room transport", () => {
  it("validates and sends the capability only to the join endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(joinRoom(QR_PAYLOAD)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peek-poke.com/api/rooms/join",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ qr_payload: QR_PAYLOAD }),
    }));
  });

  it("accepts a stable physical table code through the same join endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(joinRoom(TABLE_CODE)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ qr_payload: TABLE_CODE }),
    }));
  });

  it("rejects a non-room code before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(() => joinRoom("a-user-id")).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
