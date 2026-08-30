import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  friendRequestsReadResponseSchema,
  friendsReadResponseSchema,
} from "@peekpoke/shared";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const SENT_PEER_ID = "77777777-7777-4777-8777-777777777777";
const REQUESTER_ID = "33333333-3333-4333-8333-333333333333";
const FRIEND_ID = "44444444-4444-4444-8444-444444444444";
const INCOMING_ID = "55555555-5555-4555-8555-555555555555";
const SENT_ID = "66666666-6666-4666-8666-666666666666";
const timestamp = "2026-08-07T10:00:00.000Z";

const profile = (id: string, username: string) => ({
  id,
  username,
  display_name: null,
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
});

const accepted = {
  id: FRIEND_ID,
  requester_id: VIEWER_ID,
  addressee_id: PEER_ID,
  status: "accepted",
  requested_at: timestamp,
  responded_at: timestamp,
  requester: profile(VIEWER_ID, "viewer"),
  addressee: profile(PEER_ID, "named-peer"),
};
const incoming = {
  id: INCOMING_ID,
  requester_id: REQUESTER_ID,
  addressee_id: VIEWER_ID,
  status: "pending",
  requested_at: timestamp,
  responded_at: null,
  requester: profile(REQUESTER_ID, "requester"),
};
const sent = {
  id: SENT_ID,
  requester_id: VIEWER_ID,
  addressee_id: SENT_PEER_ID,
  status: "pending",
  requested_at: timestamp,
  responded_at: null,
  addressee: profile(SENT_PEER_ID, "addressee"),
};

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  results: [] as Array<{ data: unknown; error: unknown }>,
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: VIEWER_ID }, supabase: {} }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc, from: database.from }),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  notifyFriendshipChanged: vi.fn(async () => undefined),
}));

import { GET as getFriends } from "@/app/api/friends/route";
import { GET as getRequests } from "@/app/api/friends/requests/route";

describe("friendship read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.results = [];
    database.from.mockImplementation(() => {
      const result = database.results.shift();
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "or", "eq", "order"]) {
        chain[method] = vi.fn(() => chain);
      }
      chain.limit = vi.fn(async () => result);
      return chain;
    });
  });

  it("returns strict viewer-bound pages and uses legacy rows only for peer roles", async () => {
    database.rpc.mockResolvedValue({
      data: { friends: [{ id: PEER_ID, username: "broad-leak", roles: ["subscriber"], secret: true }] },
      error: null,
    });
    database.results = [
      { data: [accepted], error: null },
      { data: [incoming], error: null },
      { data: [sent], error: null },
    ];

    const response = await getFriends(new Request("https://example.test/api/friends?limit=100"), {} as never);
    const body = friendsReadResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.friends[0]?.addressee).toMatchObject({ username: "named-peer", roles: ["subscriber"] });
    expect(body.friends[0]?.addressee).not.toHaveProperty("secret");
    expect(body.sentRequestUserIds).toEqual([SENT_PEER_ID]);
  });

  it("adds viewer identity to the strict requests-only response", async () => {
    database.results = [
      { data: [incoming], error: null },
      { data: [sent], error: null },
    ];

    const response = await getRequests(new Request("https://example.test/api/friends/requests?limit=100"), {} as never);

    expect(response.status).toBe(200);
    expect(friendRequestsReadResponseSchema.parse(await response.json()).viewer_id).toBe(VIEWER_ID);
  });

  it("fails the requests-only route closed on a missing requester profile", async () => {
    database.results = [
      { data: [{ ...incoming, requester: null }], error: null },
      { data: [sent], error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getRequests(new Request("https://example.test/api/friends/requests?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "FRIEND_REQUESTS_FETCH_FAILED" });
  });

  it("fails the requests-only route closed on a repeated cross-direction peer", async () => {
    database.results = [
      { data: [incoming], error: null },
      { data: [{
        ...sent,
        addressee_id: REQUESTER_ID,
        addressee: profile(REQUESTER_ID, "same-peer"),
      }], error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getRequests(new Request("https://example.test/api/friends/requests?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "FRIEND_REQUESTS_FETCH_FAILED" });
  });

  it.each([
    ["self incoming", [{
      ...incoming,
      requester_id: VIEWER_ID,
      requester: profile(VIEWER_ID, "viewer"),
    }], [sent]],
    ["self sent", [incoming], [{
      ...sent,
      addressee_id: VIEWER_ID,
      addressee: profile(VIEWER_ID, "viewer"),
    }]],
  ])("fails the requests-only route closed on %s", async (_label, incomingRows, sentRows) => {
    database.results = [
      { data: incomingRows, error: null },
      { data: sentRows, error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getRequests(new Request("https://example.test/api/friends/requests?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "FRIEND_REQUESTS_FETCH_FAILED" });
  });

  it.each([
    ["self incoming", [{
      ...incoming,
      requester_id: VIEWER_ID,
      requester: profile(VIEWER_ID, "viewer"),
    }], [sent]],
    ["self sent", [incoming], [{
      ...sent,
      addressee_id: VIEWER_ID,
      addressee: profile(VIEWER_ID, "viewer"),
    }]],
  ])("fails the combined route closed on %s", async (_label, incomingRows, sentRows) => {
    database.rpc.mockResolvedValue({ data: { friends: [{ id: PEER_ID, roles: ["user"] }] }, error: null });
    database.results = [
      { data: [accepted], error: null },
      { data: incomingRows, error: null },
      { data: sentRows, error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getFriends(new Request("https://example.test/api/friends?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "FRIENDS_FETCH_FAILED" });
  });

  it.each([
    ["extra raw field", [{ ...accepted, private_column: "secret" }]],
    ["missing joined profile", [{ ...accepted, addressee: null }]],
    ["wrong raw type", [{ ...accepted, addressee: { ...accepted.addressee, is_online: "false" } }]],
    ["viewer mismatch", [{ ...accepted, requester_id: REQUESTER_ID }]],
    ["duplicate rows", [accepted, accepted]],
    ["self accepted", [{
      ...accepted,
      addressee_id: VIEWER_ID,
      addressee: profile(VIEWER_ID, "viewer"),
    }]],
    ["repeated peer identity", [{
      ...accepted,
      addressee_id: SENT_PEER_ID,
      addressee: profile(SENT_PEER_ID, "same-peer"),
    }]],
    ["over-cardinality", Array.from({ length: 102 }, () => accepted)],
  ])("fails closed on %s", async (_label, acceptedRows) => {
    database.rpc.mockResolvedValue({ data: { friends: [{ id: PEER_ID, roles: ["user"] }] }, error: null });
    database.results = [
      { data: acceptedRows, error: null },
      { data: [incoming], error: null },
      { data: [sent], error: null },
    ];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getFriends(new Request("https://example.test/api/friends?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "FRIENDS_FETCH_FAILED" });
  });
});
