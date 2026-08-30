import { beforeEach, describe, expect, it, vi } from "vitest";
import { dmInboxResponseSchemaFor } from "@peekpoke/shared";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";

const profile = (id: string, username: string) => ({
  id,
  username,
  display_name: null,
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
  private_profile_column: "not public",
});

const thread = {
  id: THREAD_ID,
  participant_1_id: VIEWER_ID,
  participant_2_id: PEER_ID,
  last_message_at: null,
  last_message_preview: "Hello",
  created_at: "2026-08-07T10:00:00.000Z",
  unread_count: 7,
  participant_1: profile(VIEWER_ID, "viewer"),
  participant_2: profile(PEER_ID, "peer"),
  operational_column: "not public",
};

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  cursors: { data: [] as unknown, error: null as unknown },
  blocked: new Set<string>(),
  cursorLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: VIEWER_ID }, supabase: {} }),
  getBlockedPeerIds: vi.fn(async () => database.blocked),
  isBlocked: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    rpc: database.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => database.cursors,
          limit: database.cursorLimit,
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/dm/threads/route";

function request(query = "?limit=100") {
  return GET(new Request(`http://localhost/api/dm/threads${query}`), {} as never);
}

describe("GET /api/dm/threads contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.blocked = new Set();
    database.rpc.mockResolvedValue({ data: { threads: [thread], total_unread: 999, private_rpc_column: true }, error: null });
    database.cursors = {
      data: [{ thread_id: THREAD_ID, last_read_sequence: 3, thread: { next_message_sequence: 5 } }],
      error: null,
    };
    database.cursorLimit.mockImplementation(async () => database.cursors);
  });

  it("returns only the exact viewer-bound DTO and computes unread from validated cursors", async () => {
    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dmInboxResponseSchemaFor(VIEWER_ID).parse(payload)).toEqual(payload);
    expect(payload.total_unread).toBe(2);
    expect(payload.threads[0]).not.toHaveProperty("operational_column");
    expect(payload.threads[0].participant_1).not.toHaveProperty("private_profile_column");
    expect(database.rpc).toHaveBeenCalledWith("get_threads", { p_user_id: VIEWER_ID });
  });

  it.each([
    ["missing participant profile", { ...thread, participant_2: undefined }],
    ["participant profile mismatch", { ...thread, participant_2: profile(VIEWER_ID, "wrong") }],
    ["self participant", { ...thread, participant_2_id: VIEWER_ID, participant_2: profile(VIEWER_ID, "viewer") }],
    ["wrong viewer", { ...thread, participant_1_id: "44444444-4444-4444-8444-444444444444", participant_1: profile("44444444-4444-4444-8444-444444444444", "other") }],
  ])("fails %s closed", async (_label, malformed) => {
    database.rpc.mockResolvedValue({ data: { threads: [malformed], total_unread: 7 }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREADS_FETCH_FAILED" });
  });

  it("ignores legacy RPC unread values and uses only durable cursor state", async () => {
    database.rpc.mockResolvedValue({
      data: {
        threads: [{ ...thread, unread_count: "legacy-corrupt" }],
        total_unread: "legacy-corrupt",
      },
      error: null,
    });

    const response = await request();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.threads[0].unread_count).toBe(2);
    expect(payload.total_unread).toBe(2);
  });

  it("fails duplicate public thread and peer identities closed", async () => {
    database.rpc.mockResolvedValue({ data: { threads: [thread, thread], total_unread: 14 }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREADS_FETCH_FAILED" });
  });

  it.each([
    ["string sequence", [{ thread_id: THREAD_ID, last_read_sequence: "3", thread: { next_message_sequence: 5 } }]],
    ["missing relation", [{ thread_id: THREAD_ID, last_read_sequence: 3 }]],
    ["cursor ahead of thread", [{ thread_id: THREAD_ID, last_read_sequence: 6, thread: { next_message_sequence: 5 } }]],
    ["extra cursor field", [{ thread_id: THREAD_ID, last_read_sequence: 3, thread: { next_message_sequence: 5 }, legacy: true }]],
    ["extra relation field", [{ thread_id: THREAD_ID, last_read_sequence: 3, thread: { next_message_sequence: 5, legacy: true } }]],
    ["duplicate row", [
      { thread_id: THREAD_ID, last_read_sequence: 3, thread: { next_message_sequence: 5 } },
      { thread_id: THREAD_ID, last_read_sequence: 4, thread: { next_message_sequence: 5 } },
    ]],
    ["missing row", []],
    ["unexpected row", [{
      thread_id: "44444444-4444-4444-8444-444444444444",
      last_read_sequence: 3,
      thread: { next_message_sequence: 5 },
    }]],
  ])("fails malformed cursor rows: %s", async (_label, cursors) => {
    database.cursors = { data: cursors, error: null };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "THREAD_READ_STATE_CORRUPT" });
  });

  it.each(["42P01", "PGRST205", "42501", "XX000"])("fails cursor infrastructure error %s closed", async (code) => {
    database.cursors = { data: null, error: { code } };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "THREAD_READ_STATE_UNAVAILABLE",
    });
  });

  it("probes required cursor infrastructure for an empty inbox", async () => {
    database.rpc.mockResolvedValue({ data: { threads: [], total_unread: 0 }, error: null });
    database.cursors = { data: null, error: { code: "42P01" } };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(database.cursorLimit).toHaveBeenCalledWith(0);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "THREAD_READ_STATE_UNAVAILABLE",
    });
  });

  it("rejects a null cursor result even when the inbox is empty", async () => {
    database.rpc.mockResolvedValue({ data: { threads: [], total_unread: 0 }, error: null });
    database.cursors = { data: null, error: null };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "THREAD_READ_STATE_CORRUPT",
    });
  });

  it("fails a get_threads RPC error closed before querying cursors", async () => {
    database.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request();

    expect(response.status).toBe(500);
    expect(database.cursorLimit).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: "THREADS_FETCH_FAILED" });
  });
});
