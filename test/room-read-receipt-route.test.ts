import { beforeEach, describe, expect, it, vi } from "vitest";
import { readReceiptResponseSchema } from "@peekpoke/shared";

const testData = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  roomId: "22222222-2222-4222-8222-222222222222",
  membership: { value: { room_id: "22222222-2222-4222-8222-222222222222" } },
  rpc: vi.fn(),
  broadcast: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: testData.userId },
      params: { roomId: testData.roomId },
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: testData.membership.value, error: null }) }),
            }),
          }),
        }),
      },
    }),
  verifyRoomMembership: vi.fn(async () => testData.membership.value),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: testData.rpc }),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  notifyRoomMessagesChanged: testData.broadcast,
}));

import { POST } from "@/app/api/rooms/[roomId]/read/route";

function request() {
  return POST(new Request(`http://localhost/api/rooms/${testData.roomId}/read`, { method: "POST" }));
}

describe("POST /api/rooms/[roomId]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testData.membership.value = { room_id: testData.roomId };
    testData.rpc.mockResolvedValue({
      data: { success: true, last_read_sequence: 7 },
      error: null,
    });
  });

  it("broadcasts the committed read sequence to the room", async () => {
    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(readReceiptResponseSchema.parse(payload)).toEqual(payload);
    expect(testData.broadcast).toHaveBeenCalledWith(testData.roomId, "read", testData.userId, 7);
  });

  it("does not send an invalid zero sequence hint", async () => {
    testData.rpc.mockResolvedValue({
      data: { success: true, last_read_sequence: 0 },
      error: null,
    });

    await expect(request()).resolves.toMatchObject({ status: 200 });
    expect(testData.broadcast).toHaveBeenCalledWith(testData.roomId, "read", testData.userId, undefined);
  });
});
