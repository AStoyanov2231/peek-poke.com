import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/groups/route";
import { POST as sendGroupMessage } from "@/app/api/groups/[groupId]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request, context?: { params?: unknown }) => handler(request, {
      user: { id: USER_ID },
      supabase: {},
      ...context,
    }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

const group = {
  id: GROUP_ID,
  name: "Shared group",
  member_count: 1,
  last_message_at: null,
  last_message_preview: null,
  created_at: "2026-08-14T10:00:00.000Z",
  unread_count: 0,
};

function joinRequest(content: string) {
  return new Request("http://localhost/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qr_content: content }),
  });
}

function messageRequest(content = "hello") {
  return new Request(`http://localhost/api/groups/${GROUP_ID}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": CLIENT_ID,
    },
    body: JSON.stringify({ client_id: CLIENT_ID, content }),
  });
}

const message = {
  id: "55555555-5555-4555-8555-555555555555",
  thread_id: GROUP_ID,
  sender_id: USER_ID,
  client_id: CLIENT_ID,
  sequence: 1,
  content: "hello",
  message_type: "text",
  media_url: null,
  media_thumbnail_url: null,
  is_read: true,
  is_edited: false,
  is_deleted: false,
  created_at: "2026-08-14T10:01:00.000Z",
  reply_to_id: null,
  reply_to: null,
  sender: {
    id: USER_ID,
    username: "viewer",
    display_name: "Viewer",
    avatar_url: null,
    location_text: null,
    is_online: true,
    last_seen_at: null,
  },
};

describe("shared group API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockResolvedValue({
      data: { group, is_new_group: true, is_new_member: true },
      error: null,
    });
  });

  it("creates once, joins again idempotently, and preserves exact QR text", async () => {
    const content = "  https://coffee.example/table?id=7  ";
    database.rpc
      .mockResolvedValueOnce({ data: { group, is_new_group: true, is_new_member: true }, error: null })
      .mockResolvedValueOnce({ data: { group, is_new_group: false, is_new_member: false }, error: null });
    const first = await POST(joinRequest(content));
    const second = await POST(joinRequest(content));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ is_new_group: false, is_new_member: false });
    expect(database.rpc).toHaveBeenNthCalledWith(1, "create_or_join_shared_group", {
      p_user_id: USER_ID,
      p_qr_content: content,
    });
    expect(database.rpc).toHaveBeenNthCalledWith(2, "create_or_join_shared_group", {
      p_user_id: USER_ID,
      p_qr_content: content,
    });
  });

  it("converges concurrent first scans and keeps different payloads distinct", async () => {
    const ids = [GROUP_ID, "66666666-6666-4666-8666-666666666666"];
    database.rpc.mockImplementation(async (_name: string, args: { p_qr_content: string }) => ({
      data: { group: { ...group, id: args.p_qr_content === "coffee" ? ids[0] : ids[1] }, is_new_group: true, is_new_member: true },
      error: null,
    }));
    const responses = await Promise.all([
      POST(joinRequest("coffee")),
      POST(joinRequest("coffee")),
      POST(joinRequest("different-table")),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    expect(payloads[0].group.id).toBe(ids[0]);
    expect(payloads[1].group.id).toBe(ids[0]);
    expect(payloads[2].group.id).toBe(ids[1]);
  });

  it("does not let a nonmember send to a guessed group", async () => {
    database.rpc.mockResolvedValue({ data: { error: "GROUP_NOT_FOUND" }, error: null });
    const response = await sendGroupMessage(messageRequest(), { params: { groupId: GROUP_ID } } as never);
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("hello");
  });

  it("sends a member message with its idempotency key", async () => {
    database.rpc.mockResolvedValue({ data: { message, deduplicated: false }, error: null });
    const response = await sendGroupMessage(messageRequest(), { params: { groupId: GROUP_ID } } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe(CLIENT_ID);
    expect(database.rpc).toHaveBeenCalledWith("send_shared_group_message_transactional", {
      p_group_id: GROUP_ID,
      p_sender_id: USER_ID,
      p_client_id: CLIENT_ID,
      p_content: "hello",
    });
  });
});
