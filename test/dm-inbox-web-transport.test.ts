import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { threadsQueryOptions, webQueryKeys } from "@/data/web-query";

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

afterEach(() => vi.unstubAllGlobals());

describe("web DM inbox transport", () => {
  it("validates before transforming and caching the inbox", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.fetchQuery(threadsQueryOptions)).resolves.toMatchObject({
      totalUnread: 1,
      threads: [{ id: thread.id, type: "dm" }],
    });
    expect(client.getQueryData(webQueryKeys.threads)).toMatchObject({ totalUnread: 1 });
  });

  it.each([
    ["extra public metadata", { ...payload, raw_database: true }],
    ["missing profile", { ...payload, threads: [{ ...thread, participant_2: undefined }] }],
    ["wrong viewer", { ...payload, viewer_id: "44444444-4444-4444-8444-444444444444" }],
    ["total mismatch", { ...payload, total_unread: 2 }],
  ])("rejects %s before it enters the web query cache", async (_label, malformed) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(malformed), {
      headers: { "x-request-id": "request-web-inbox" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.fetchQuery(threadsQueryOptions)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "request-web-inbox",
    });
    expect(client.getQueryData(webQueryKeys.threads)).toBeUndefined();
  });

  it.each([
    ["503 unavailable", () => new Response(JSON.stringify({
      version: "v1",
      error: "Inbox temporarily unavailable",
      message: "Inbox temporarily unavailable",
      code: "THREAD_READ_STATE_UNAVAILABLE",
      request_id: "request-web-inbox-unavailable",
    }), { status: 503 })],
    ["malformed 2xx", () => new Response(JSON.stringify({ ...payload, total_unread: 9 }))],
  ])("preserves the prior inbox without committing stale unread after %s", async (_label, makeResponse) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const prior = {
      threads: [{
        ...thread,
        type: "dm" as const,
        participant_1: { ...thread.participant_1, bio: null, cover_image_url: null, created_at: new Date(0).toISOString(), onboarding_completed: true, roles: ["user"] },
        participant_2: { ...thread.participant_2, bio: null, cover_image_url: null, created_at: new Date(0).toISOString(), onboarding_completed: true, roles: ["user"] },
      }],
      totalUnread: 1,
    };
    client.setQueryData(webQueryKeys.threads, prior);
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse()));

    await expect(client.fetchQuery({ ...threadsQueryOptions, staleTime: 0 })).rejects.toBeTruthy();
    expect(client.getQueryData(webQueryKeys.threads)).toEqual(prior);
  });
});
