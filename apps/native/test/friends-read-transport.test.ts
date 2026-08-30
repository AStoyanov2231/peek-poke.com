import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSocial } from "@/data/social/api";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const SENT_PEER_ID = "77777777-7777-4777-8777-777777777777";
const REQUESTER_ID = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-07T10:00:00.000Z";
const page = { version: "v1", next_cursor: null, has_more: false, limit: 100 };
const profile = (id: string) => ({
  id,
  username: "user",
  display_name: null,
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
});
const friend = {
  id: "44444444-4444-4444-8444-444444444444",
  requester_id: VIEWER_ID,
  addressee_id: PEER_ID,
  status: "accepted",
  requested_at: timestamp,
  responded_at: timestamp,
  requester: profile(VIEWER_ID),
  addressee: profile(PEER_ID),
};
const incoming = {
  id: "55555555-5555-4555-8555-555555555555",
  requester_id: REQUESTER_ID,
  addressee_id: VIEWER_ID,
  status: "pending",
  requested_at: timestamp,
  responded_at: null,
  requester: profile(REQUESTER_ID),
};
const sent = {
  id: "66666666-6666-4666-8666-666666666666",
  requester_id: VIEWER_ID,
  addressee_id: SENT_PEER_ID,
  status: "pending",
  requested_at: timestamp,
  responded_at: null,
  addressee: profile(SENT_PEER_ID),
};

function payload() {
  return {
    viewer_id: VIEWER_ID,
    friends: [friend],
    requests: [incoming],
    sentRequests: [sent],
    sentRequestUserIds: [SENT_PEER_ID],
    pagination: { friends: page, requests: page, sentRequests: page },
  };
}

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "https://www.peek-poke.com" },
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "native-friend-key-000001" }));

afterEach(() => vi.unstubAllGlobals());

describe("native friendship read transport", () => {
  it("validates the shared server DTO while preserving the native UI shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload()))));

    await expect(fetchSocial()).resolves.toEqual({
      friends: [friend],
      requests: [incoming],
      sentRequests: [sent],
      sentRequestUserIds: [SENT_PEER_ID],
    });
  });

  it.each([
    ["extra", () => ({ ...payload(), raw_database: true })],
    ["type", () => ({ ...payload(), viewer_id: 42 })],
    ["missing profile", () => ({ ...payload(), friends: [{ ...friend, addressee: undefined }] })],
    ["duplicate", () => ({ ...payload(), requests: [incoming, incoming] })],
    ["mismatch", () => ({ ...payload(), sentRequestUserIds: [REQUESTER_ID] })],
    ["repeated peer", () => ({
      ...payload(),
      sentRequests: [{ ...sent, addressee_id: PEER_ID, addressee: profile(PEER_ID) }],
      sentRequestUserIds: [PEER_ID],
    })],
    ["self accepted", () => ({
      ...payload(),
      friends: [{ ...friend, addressee_id: VIEWER_ID, addressee: profile(VIEWER_ID) }],
    })],
    ["self incoming", () => ({
      ...payload(),
      requests: [{ ...incoming, requester_id: VIEWER_ID, requester: profile(VIEWER_ID) }],
    })],
    ["self sent", () => ({
      ...payload(),
      sentRequests: [{ ...sent, addressee_id: VIEWER_ID, addressee: profile(VIEWER_ID) }],
      sentRequestUserIds: [VIEWER_ID],
    })],
    ["over-cardinality", () => ({ ...payload(), sentRequests: Array.from({ length: 101 }, () => sent) })],
  ])("rejects malformed %s data before QueryClient caching", async (label, mutate) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(mutate()), {
      headers: { "x-request-id": "request-friends-native" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["friends-contract", label] as const;

    await expect(client.fetchQuery({ queryKey, queryFn: fetchSocial, retry: false }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });
});
