import { describe, expect, it } from "vitest";
import {
  dmThreadCreateRequestSchema,
  dmThreadCreateResponseSchema,
  dmThreadCreateResponseSchemaFor,
} from "@peekpoke/shared";

const ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const response = {
  id: ID,
  is_new: true,
  balance: 4,
  thread: {
    id: ID,
    participant_1_id: ID,
    participant_2_id: PEER_ID,
    last_message_at: null,
    last_message_preview: null,
    created_at: "2026-08-07T10:00:00.000Z",
    unread_count: 0,
    participant_1: {
      id: ID,
      username: "viewer",
      display_name: "Viewer",
      avatar_url: null,
      location_text: null,
      is_online: true,
      last_seen_at: "2026-08-07T09:59:00.000Z",
    },
    participant_2: {
      id: PEER_ID,
      username: "peer",
      display_name: null,
      avatar_url: null,
      location_text: "Sofia",
      is_online: false,
      last_seen_at: null,
    },
  },
};

describe("DM thread create shared contract", () => {
  it("accepts exact requests and valid new/existing responses", () => {
    expect(dmThreadCreateRequestSchema.parse({ user_id: PEER_ID })).toEqual({ user_id: PEER_ID });
    expect(dmThreadCreateResponseSchema.parse(response)).toEqual(response);
    expect(dmThreadCreateResponseSchema.parse({ ...response, is_new: false })).toEqual({
      ...response,
      is_new: false,
    });
  });

  it.each([
    ["request extra", dmThreadCreateRequestSchema, { user_id: PEER_ID, raw: true }],
    ["response extra", dmThreadCreateResponseSchema, { ...response, raw: true }],
    ["response missing", dmThreadCreateResponseSchema, { id: ID, is_new: true, thread: response.thread }],
    ["response type", dmThreadCreateResponseSchema, { ...response, balance: "4" }],
    ["response semantic", dmThreadCreateResponseSchema, { ...response, balance: -1 }],
    ["response ID mismatch", dmThreadCreateResponseSchema, {
      ...response,
      thread: { ...response.thread, id: PEER_ID },
    }],
    ["same participant", dmThreadCreateResponseSchema, {
      ...response,
      thread: { ...response.thread, participant_2_id: ID },
    }],
    ["nested extra", dmThreadCreateResponseSchema, {
      ...response,
      thread: { ...response.thread, private_column: "leak" },
    }],
    ["missing participant_1", dmThreadCreateResponseSchema, {
      ...response,
      thread: (() => {
        const { participant_1: _participant, ...missing } = response.thread;
        return missing;
      })(),
    }],
    ["missing participant_2", dmThreadCreateResponseSchema, {
      ...response,
      thread: (() => {
        const { participant_2: _participant, ...missing } = response.thread;
        return missing;
      })(),
    }],
    ["nested participant profile ID", dmThreadCreateResponseSchema, {
      ...response,
      thread: {
        ...response.thread,
        participant_1: {
          id: PEER_ID,
          username: "mismatch",
          display_name: null,
          avatar_url: null,
          location_text: null,
          is_online: false,
          last_seen_at: null,
        },
      },
    }],
    ["participant roles", dmThreadCreateResponseSchema, {
      ...response,
      thread: {
        ...response.thread,
        participant_1: { ...response.thread.participant_1, roles: ["user"] },
      },
    }],
    ["participant account_deleted", dmThreadCreateResponseSchema, {
      ...response,
      thread: {
        ...response.thread,
        participant_2: { ...response.thread.participant_2, account_deleted: true },
      },
    }],
  ])("rejects malformed %s", (_kind, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("binds an otherwise valid response to the requested target", () => {
    const otherTarget = "44444444-4444-4444-8444-444444444444";
    expect(dmThreadCreateResponseSchema.safeParse(response).success).toBe(true);
    expect(dmThreadCreateResponseSchemaFor(PEER_ID).safeParse(response).success).toBe(true);
    expect(dmThreadCreateResponseSchemaFor(otherTarget).safeParse(response).success).toBe(false);
  });
});
