import { beforeEach, describe, expect, it, vi } from "vitest";

const broadcastPrivateRealtimeEvent = vi.hoisted(() => vi.fn());
const sendPushToUser = vi.hoisted(() => vi.fn());
const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));

import { processOutboxBatch } from "@/server/outbox/worker";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const SENDER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const LATE_JOINER_ID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";

function chain<T>(result: T) {
  const value = {
    select: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  value.select.mockReturnValue(value);
  value.in.mockReturnValue(value);
  value.order.mockReturnValue(value);
  value.limit.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  return value;
}

describe("shared group outbox recipient snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broadcastPrivateRealtimeEvent.mockResolvedValue(true);
    sendPushToUser.mockResolvedValue(undefined);
    database.from.mockImplementation((table: string) => {
      if (table === "outbox_events") return chain({ data: null, error: null });
      if (table === "shared_group_members") {
        return chain({
          data: [{ user_id: SENDER_ID }, { user_id: MEMBER_ID }],
          error: null,
        });
      }
      if (table === "shared_group_messages") {
        return chain({
          data: { content: "hello", message_type: "text", sender_id: SENDER_ID },
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: EVENT_ID,
            event_type: "shared_group.message.changed",
            aggregate_id: GROUP_ID,
            attempts: 1,
            payload: {
              group_id: GROUP_ID,
              message_id: MESSAGE_ID,
              sender_id: SENDER_ID,
              recipient_ids: [SENDER_ID, MEMBER_ID],
              sequence: 1,
              action: "sent",
            },
          }],
          error: null,
        };
      }
      if (name === "claim_shared_group_message_recipients") return { data: [SENDER_ID, MEMBER_ID], error: null };
      if (name === "complete_outbox_event") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  it("does not notify a member who joined after the message was sent", async () => {
    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(
      `sync:user:${SENDER_ID}`,
      "messages-changed",
      expect.objectContaining({ thread_type: "shared_group" }),
    );
    expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalledWith(
      `sync:user:${LATE_JOINER_ID}`,
      expect.anything(),
      expect.anything(),
    );
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(MEMBER_ID, expect.anything());
  });

  it("broadcasts an erasure invalidation without loading a deleted message", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: EVENT_ID,
            event_type: "shared_group.message.changed",
            aggregate_id: GROUP_ID,
            attempts: 1,
            payload: {
              group_id: GROUP_ID,
              actor_id: SENDER_ID,
              recipient_ids: [MEMBER_ID],
              action: "deleted",
            },
          }],
          error: null,
        };
      }
      if (name === "claim_shared_group_message_recipients") return { data: [MEMBER_ID], error: null };
      if (name === "complete_outbox_event") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(
      `sync:user:${MEMBER_ID}`,
      "messages-changed",
      expect.objectContaining({ action: "deleted", thread_type: "shared_group" }),
    );
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
