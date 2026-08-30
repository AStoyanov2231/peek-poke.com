import { beforeEach, describe, expect, it, vi } from "vitest";
import { readReceiptResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "22222222-2222-4222-8222-222222222222";

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  threadId: "22222222-2222-4222-8222-222222222222",
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: USER_ID },
      params: { threadId: database.threadId },
    }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

import { POST } from "@/app/api/dm/[threadId]/read/route";

function request() {
  return POST(new Request(`http://localhost/api/dm/${database.threadId}/read`, {
    method: "POST",
  }), {} as never);
}

describe("POST /api/dm/[threadId]/read contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.threadId = THREAD_ID;
    database.rpc.mockResolvedValue({
      data: { success: true, last_read_sequence: 7 },
      error: null,
    });
  });

  it("derives the authenticated member server-side and returns one exact DTO", async () => {
    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(readReceiptResponseSchema.parse(payload)).toEqual(payload);
    expect(database.rpc).toHaveBeenCalledWith("mark_thread_read_sequence", {
      p_thread_id: THREAD_ID,
      p_user_id: USER_ID,
    });
  });

  it("rejects an invalid thread before touching the database", async () => {
    database.threadId = "not-a-thread";

    const response = await request();

    expect(response.status).toBe(400);
    expect(database.rpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_THREAD_ID" });
  });

  it("maps a transactional nonmember result to the public not-found envelope", async () => {
    database.rpc.mockResolvedValue({ data: { error: "THREAD_NOT_FOUND" }, error: null });

    const response = await request();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "THREAD_NOT_FOUND" });
  });

  it.each([
    ["missing RPC rollout", { data: null, error: { code: "PGRST202" } }],
    ["database failure", { data: null, error: { code: "XX000" } }],
  ])("fails %s closed without an unsafe legacy mutation", async (_label, result) => {
    database.rpc.mockResolvedValue(result);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "MESSAGE_READ_FAILED" });
  });

  it.each([
    ["null", null],
    ["array", [{ success: true, last_read_sequence: 7 }]],
    ["missing sequence", { success: true }],
    ["string sequence", { success: true, last_read_sequence: "7" }],
    ["negative sequence", { success: true, last_read_sequence: -1 }],
    ["unsafe sequence", { success: true, last_read_sequence: Number.MAX_SAFE_INTEGER + 1 }],
    ["extra field", { success: true, last_read_sequence: 7, private_column: true }],
    ["unknown error", { error: "PRIVATE_DATABASE_ERROR" }],
  ])("rejects malformed raw RPC result: %s", async (_label, data) => {
    database.rpc.mockResolvedValue({ data, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "MESSAGE_READ_FAILED" });
  });
});
