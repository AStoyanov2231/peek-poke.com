import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";
import { fetchSharedGroups, joinSharedGroup, sendSharedGroupMessage } from "@/data/shared-groups";
import { sharedGroupsQuery } from "@/data/social/queries";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const group = {
  id: GROUP_ID,
  name: "Shared group" as const,
  member_count: 2,
  last_message_at: null,
  last_message_preview: null,
  created_at: "2026-08-14T10:00:00.000Z",
  unread_count: 1,
};
const groupsPayload = {
  groups: [group],
  total_unread: 1,
  pagination: { version: "v1" as const, next_cursor: null, has_more: false, limit: 100 },
};

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));
vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "https://www.peek-poke.com" } }));

afterEach(() => vi.unstubAllGlobals());

describe("native shared group transport", () => {
  it("validates and caches the group inbox alongside DM data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(groupsPayload))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    onlineManager.setOnline(true);

    await expect(client.fetchQuery(sharedGroupsQuery())).resolves.toEqual(groupsPayload);
    expect(client.getQueryData(nativeQueryKeys.inbox.groups)).toEqual(groupsPayload);
  });

  it("sends exact QR text without following it and reuses group message idempotency", async () => {
    const content = "  https://coffee.example/table?id=7  ";
    const responses = [
      { group: { ...group, unread_count: 0 }, is_new_group: true, is_new_member: true },
      { message: {
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
      } },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/groups")) return new Response(JSON.stringify(responses[0]));
      expect(url).toContain(`/api/groups/${GROUP_ID}`);
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(CLIENT_ID);
      return new Response(JSON.stringify(responses[1]));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(joinSharedGroup(content)).resolves.toMatchObject({ group: { id: GROUP_ID } });
    await expect(sendSharedGroupMessage(GROUP_ID, { client_id: CLIENT_ID, content: "hello" })).resolves.toMatchObject({
      message: { thread_id: GROUP_ID, client_id: CLIENT_ID },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchMock.mock.calls[0])).toContain(content);
  });

  it("rejects malformed unread state before caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...groupsPayload, total_unread: 7 }))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    onlineManager.setOnline(true);
    await expect(client.fetchQuery({ ...sharedGroupsQuery(), staleTime: 0 })).rejects.toBeTruthy();
    expect(client.getQueryData(nativeQueryKeys.inbox.groups)).toBeUndefined();
  });
});
