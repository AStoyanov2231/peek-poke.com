import { describe, expect, it } from "vitest";
import {
  friendRequestsReadResponseSchema,
  friendSchema,
  friendshipCreateResponseSchema,
  friendsReadResponseSchema,
} from "@peekpoke/shared";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const REQUESTER_ID = "22222222-2222-4222-8222-222222222222";
const ADDRESSEE_ID = "33333333-3333-4333-8333-333333333333";
const SENT_PEER_ID = "88888888-8888-4888-8888-888888888888";
const FRIEND_ID = "44444444-4444-4444-8444-444444444444";
const INCOMING_ID = "55555555-5555-4555-8555-555555555555";
const SENT_ID = "66666666-6666-4666-8666-666666666666";
const timestamp = "2026-08-07T10:00:00.000Z";

const profile = (id: string) => ({
  id,
  username: `user-${id.slice(0, 4)}`,
  display_name: null,
  avatar_url: null,
  location_text: null,
  is_online: false,
  last_seen_at: null,
});

const page = { version: "v1" as const, next_cursor: null, has_more: false, limit: 100 };
const friend = {
  id: FRIEND_ID,
  requester_id: VIEWER_ID,
  addressee_id: ADDRESSEE_ID,
  status: "accepted" as const,
  requested_at: timestamp,
  responded_at: timestamp,
  requester: profile(VIEWER_ID),
  addressee: { ...profile(ADDRESSEE_ID), roles: ["subscriber"] },
};
const incoming = {
  id: INCOMING_ID,
  requester_id: REQUESTER_ID,
  addressee_id: VIEWER_ID,
  status: "pending" as const,
  requested_at: timestamp,
  responded_at: null,
  requester: profile(REQUESTER_ID),
};
const sent = {
  id: SENT_ID,
  requester_id: VIEWER_ID,
  addressee_id: SENT_PEER_ID,
  status: "pending" as const,
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

describe("friendship read contracts", () => {
  it("accepts exact viewer-bound friends and requests", () => {
    expect(friendsReadResponseSchema.parse(payload())).toEqual(payload());
    expect(friendRequestsReadResponseSchema.safeParse({
      viewer_id: VIEWER_ID,
      requests: [incoming],
      sentRequests: [sent],
      pagination: { requests: page, sentRequests: page },
    }).success).toBe(true);
  });

  it.each([
    ["extra field", () => ({ ...payload(), database_row: true })],
    ["wrong type", () => ({ ...payload(), viewer_id: 42 })],
    ["missing accepted profile", () => ({ ...payload(), friends: [{ ...friend, addressee: undefined }] })],
    ["mismatched incoming viewer", () => ({ ...payload(), requests: [{ ...incoming, addressee_id: ADDRESSEE_ID }] })],
    ["duplicate friendship row", () => ({ ...payload(), requests: [incoming, incoming] })],
    ["duplicate sent peer", () => ({
      ...payload(),
      sentRequests: [sent, { ...sent, id: "77777777-7777-4777-8777-777777777777" }],
      sentRequestUserIds: [SENT_PEER_ID, SENT_PEER_ID],
    })],
    ["cross-category repeated peer", () => ({
      ...payload(),
      sentRequests: [{
        ...sent,
        addressee_id: ADDRESSEE_ID,
        addressee: profile(ADDRESSEE_ID),
      }],
      sentRequestUserIds: [ADDRESSEE_ID],
    })],
    ["sent ID mismatch", () => ({ ...payload(), sentRequestUserIds: [REQUESTER_ID] })],
    ["self accepted", () => ({
      ...payload(),
      friends: [{
        ...friend,
        addressee_id: VIEWER_ID,
        addressee: profile(VIEWER_ID),
      }],
    })],
    ["self incoming", () => ({
      ...payload(),
      requests: [{
        ...incoming,
        requester_id: VIEWER_ID,
        requester: profile(VIEWER_ID),
      }],
    })],
    ["self sent", () => ({
      ...payload(),
      sentRequests: [{
        ...sent,
        addressee_id: VIEWER_ID,
        addressee: profile(VIEWER_ID),
      }],
      sentRequestUserIds: [VIEWER_ID],
    })],
    ["page over cardinality", () => ({
      ...payload(),
      friends: [],
      pagination: { ...payload().pagination, requests: { ...page, limit: 1 } },
      requests: [incoming, { ...incoming, id: "77777777-7777-4777-8777-777777777777" }],
    })],
  ])("rejects %s", (_label, mutation) => {
    expect(friendsReadResponseSchema.safeParse(mutation()).success).toBe(false);
  });

  it("rejects more than the public maximum even when pagination claims otherwise", () => {
    const friends = Array.from({ length: 101 }, (_, index) => ({
      ...friend,
      id: `${String(index).padStart(8, "0")}-4444-4444-8444-444444444444`,
    }));
    expect(friendsReadResponseSchema.safeParse({ ...payload(), friends }).success).toBe(false);
  });

  it("rejects the same peer in incoming and sent request directions", () => {
    expect(friendRequestsReadResponseSchema.safeParse({
      viewer_id: VIEWER_ID,
      requests: [incoming],
      sentRequests: [{
        ...sent,
        addressee_id: REQUESTER_ID,
        addressee: profile(REQUESTER_ID),
      }],
      pagination: { requests: page, sentRequests: page },
    }).success).toBe(false);
  });

  it("rejects self-directed friendships in the shared mutation row schema", () => {
    const selfFriendship = {
      ...friend,
      addressee_id: VIEWER_ID,
      addressee: profile(VIEWER_ID),
      status: "pending" as const,
      responded_at: null,
    };
    expect(friendSchema.safeParse(selfFriendship).success).toBe(false);
    expect(friendshipCreateResponseSchema.safeParse({
      friendship: selfFriendship,
      balance: 1,
    }).success).toBe(false);
  });
});
