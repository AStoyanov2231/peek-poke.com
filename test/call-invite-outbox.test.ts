import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const sendPushToUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects: vi.fn(),
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT = "77777777-7777-4777-8777-777777777777";
const CALLER = "11111111-1111-4111-8111-111111111111";
const CALLEE = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";

const callInvite = {
  id: EVENT,
  event_type: "call.invite",
  aggregate_id: CALL,
  payload: {
    recipient_id: CALLEE,
    sender_id: CALLER,
    thread_id: THREAD,
    call_id: CALL,
  },
  attempts: 1,
};

function configure(deliverable: boolean, deliveryError: unknown = null) {
  database.rpc.mockImplementation(async (name: string, args: unknown) => {
    if (name === "claim_outbox_events") return { data: [callInvite], error: null };
    if (name === "authorize_call_invite_delivery") {
      expect(args).toEqual({
        p_call_id: CALL,
        p_thread_id: THREAD,
        p_caller_id: CALLER,
        p_callee_id: CALLEE,
      });
      return { data: deliverable, error: deliveryError };
    }
    if (name === "complete_outbox_event") return { data: true, error: null };
    if (name === "retry_outbox_event") return { data: true, error: null };
    if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

describe("call invite outbox authorization fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { display_name: "Alice", username: "alice" },
        error: null,
      })),
    };
    chain.select.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    database.from.mockReturnValue(chain);
    sendPushToUser.mockResolvedValue(undefined);
  });

  it("delivers exactly once only after the service authorization RPC returns true", async () => {
    configure(true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(CALLEE, expect.objectContaining({
      route: `/chat/${THREAD}`,
      threadId: THREAD,
      data: { kind: "call", threadId: THREAD, callId: CALL, fromUserId: CALLER },
    }));
  });

  it.each([
    "caller blocked callee",
    "callee blocked caller",
    "caller deleted",
    "callee deleted",
    "thread deleted",
    "caller membership removed",
    "callee membership removed",
  ])("completes but makes zero provider calls when %s before the worker", async () => {
    configure(false);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(database.from).toHaveBeenCalledTimes(2);
  });

  it("makes zero provider calls and retries when authorization cannot be proven", async () => {
    configure(false, { code: "XX000" });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, retried: 1 });

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT,
      p_dead: false,
    }));
  });
});
