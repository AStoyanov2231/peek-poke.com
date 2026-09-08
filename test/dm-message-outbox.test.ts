import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const broadcastPrivateRealtimeEvent = vi.hoisted(() => vi.fn());
const sendPushToUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser }));
vi.mock("@/lib/account-deletion", () => ({ deleteStripeCustomer: vi.fn(), eraseStorageObjects: vi.fn() }));

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT = "60000000-0000-4000-8000-000000000001";
const ACTOR = "60000000-0000-4000-8000-000000000002";
const PEER = "60000000-0000-4000-8000-000000000003";
const THREAD = "60000000-0000-4000-8000-000000000004";

function event(payload: Record<string, unknown>) {
  return { id: EVENT, event_type: "message.changed", aggregate_id: THREAD, payload, attempts: 1 };
}

describe("DM outbox admission delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { select: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    chain.select.mockReturnValue(chain); chain.in.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
    database.from.mockReturnValue(chain);
    broadcastPrivateRealtimeEvent.mockResolvedValue(true);
    sendPushToUser.mockResolvedValue(undefined);
  });

  function configure(queuedEvent: ReturnType<typeof event>, eligible: boolean) {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") return { data: [queuedEvent], error: null };
      if (name === "can_users_interact_v1") return { data: eligible, error: null };
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  }

  it("uses read actor_id as the pair origin and fans out to both adult participants", async () => {
    configure(event({ thread_id: THREAD, actor_id: ACTOR, recipient_id: PEER, sequence: 3, action: "read" }), true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ completed: 1 });

    expect(database.rpc).toHaveBeenCalledWith("can_users_interact_v1", { p_user_a: ACTOR, p_user_b: PEER });
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(`sync:user:${ACTOR}`, "messages-changed", expect.objectContaining({ action: "read", actor_id: ACTOR }));
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(`sync:user:${PEER}`, "messages-changed", expect.objectContaining({ action: "read", actor_id: ACTOR }));
  });

  it("suppresses a pending or blocked new-message pair before realtime or push", async () => {
    configure(event({ thread_id: THREAD, sender_id: ACTOR, recipient_id: PEER, actor_id: ACTOR, message_id: EVENT, action: "sent" }), false);

    await expect(processOutboxBatch()).resolves.toMatchObject({ completed: 1 });

    expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
