import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";
import { inboxQuery } from "@/data/social/queries";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";

const profile = (id: string) => ({
  id,
  username: "user",
  display_name: null,
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
});

const thread = {
  id: "33333333-3333-4333-8333-333333333333",
  participant_1_id: VIEWER_ID,
  participant_2_id: PEER_ID,
  last_message_at: null,
  last_message_preview: null,
  created_at: "2026-08-07T10:00:00.000Z",
  unread_count: 1,
  participant_1: profile(VIEWER_ID),
  participant_2: profile(PEER_ID),
};

const payload = {
  viewer_id: VIEWER_ID,
  threads: [thread],
  total_unread: 1,
  pagination: { version: "v1", next_cursor: null, has_more: false, limit: 100 },
};

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "native-inbox-key-000001" }));

afterEach(() => vi.unstubAllGlobals());

describe("native DM inbox transport", () => {
  it("validates the exact shared response before caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.fetchQuery(inboxQuery())).resolves.toEqual(payload);
    expect(client.getQueryData(nativeQueryKeys.inbox.threads)).toEqual(payload);
  });

  it.each([
    ["extra participant metadata", { ...payload, threads: [{ ...thread, participant_2: { ...thread.participant_2, roles: ["admin"] } }] }],
    ["duplicate peer", { ...payload, threads: [thread, { ...thread, id: "44444444-4444-4444-8444-444444444444" }], total_unread: 2 }],
    ["malformed type", { ...payload, total_unread: "1" }],
    ["total mismatch", { ...payload, total_unread: 0 }],
  ])("rejects %s before it enters the native query cache", async (_label, malformed) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(malformed), {
      headers: { "x-request-id": "request-native-inbox" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.fetchQuery(inboxQuery())).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-native-inbox",
    });
    expect(client.getQueryData(nativeQueryKeys.inbox.threads)).toBeUndefined();
  });

  it.each([
    ["503 unavailable", () => new Response(JSON.stringify({
      version: "v1",
      error: "Inbox temporarily unavailable",
      message: "Inbox temporarily unavailable",
      code: "THREAD_READ_STATE_UNAVAILABLE",
      request_id: "request-native-inbox-unavailable",
    }), { status: 503, headers: { "x-request-id": "request-native-inbox-unavailable" } })],
    ["malformed 2xx", () => new Response(JSON.stringify({ ...payload, total_unread: 9 }), {
      headers: { "x-request-id": "request-native-inbox-corrupt" },
    })],
  ])("preserves the prior inbox without committing stale unread after %s", async (_label, makeResponse) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(nativeQueryKeys.inbox.threads, payload);
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse()));

    await expect(client.fetchQuery({ ...inboxQuery(), staleTime: 0 })).rejects.toBeTruthy();
    expect(client.getQueryData(nativeQueryKeys.inbox.threads)).toEqual(payload);
  });
});
