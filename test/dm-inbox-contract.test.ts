import { describe, expect, it } from "vitest";
import { dmInboxResponseSchema, dmInboxResponseSchemaFor } from "@peekpoke/shared";

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
});

const thread = {
  id: THREAD_ID,
  participant_1_id: VIEWER_ID,
  participant_2_id: PEER_ID,
  last_message_at: null,
  last_message_preview: "Hello",
  created_at: "2026-08-07T10:00:00.000Z",
  unread_count: 2,
  participant_1: profile(VIEWER_ID, "viewer"),
  participant_2: profile(PEER_ID, "peer"),
};

const response = {
  viewer_id: VIEWER_ID,
  threads: [thread],
  total_unread: 2,
  pagination: { version: "v1" as const, next_cursor: null, has_more: false, limit: 100 },
};

describe("DM inbox contract", () => {
  it("accepts one exact viewer-bound inbox page", () => {
    expect(dmInboxResponseSchemaFor(VIEWER_ID).parse(response)).toEqual(response);
  });

  it.each([
    ["authenticated viewer mismatch", { ...response, viewer_id: PEER_ID }],
    ["self thread", { ...response, threads: [{ ...thread, participant_2_id: VIEWER_ID, participant_2: profile(VIEWER_ID, "viewer") }] }],
    ["wrong viewer participation", { ...response, viewer_id: "44444444-4444-4444-8444-444444444444" }],
    ["profile identity mismatch", { ...response, threads: [{ ...thread, participant_2: profile(VIEWER_ID, "wrong") }] }],
    ["missing profile", { ...response, threads: [{ ...thread, participant_2: undefined }] }],
    ["extra public metadata", { ...response, threads: [{ ...thread, participant_1: { ...thread.participant_1, roles: ["admin"] } }] }],
    ["malformed unread type", { ...response, threads: [{ ...thread, unread_count: "2" }], total_unread: 2 }],
    ["unread total mismatch", { ...response, total_unread: 3 }],
    ["pagination mismatch", { ...response, pagination: { ...response.pagination, has_more: true } }],
  ])("rejects %s", (_label, payload) => {
    expect(dmInboxResponseSchemaFor(VIEWER_ID).safeParse(payload).success).toBe(false);
  });

  it("rejects duplicate thread IDs and duplicate peer IDs", () => {
    const second = {
      ...thread,
      id: "44444444-4444-4444-8444-444444444444",
      unread_count: 0,
    };
    expect(dmInboxResponseSchema.safeParse({ ...response, threads: [thread, thread], total_unread: 4 }).success).toBe(false);
    expect(dmInboxResponseSchema.safeParse({ ...response, threads: [thread, second] }).success).toBe(false);
  });

  it("rejects over-cardinality and pages larger than their declared limit", () => {
    const manyThreads = Array.from({ length: 101 }, (_, index) => {
      const suffix = (index + 10).toString(16).padStart(12, "0");
      const peerId = `22222222-2222-4222-8222-${suffix}`;
      return {
        ...thread,
        id: `33333333-3333-4333-8333-${suffix}`,
        participant_2_id: peerId,
        participant_2: profile(peerId, `peer-${index}`),
        unread_count: 0,
      };
    });
    expect(dmInboxResponseSchema.safeParse({ ...response, threads: manyThreads, total_unread: 0 }).success).toBe(false);
    expect(dmInboxResponseSchema.safeParse({ ...response, pagination: { ...response.pagination, limit: 0 } }).success).toBe(false);
  });
});
