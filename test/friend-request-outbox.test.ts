import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
const broadcastPrivateRealtimeEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => database,
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastPrivateRealtimeEvent,
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects: vi.fn(),
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const FRIENDSHIP_ID = "10000000-0000-4000-8000-000000000001";
const REQUESTER_ID = "10000000-0000-4000-8000-000000000002";
const ADDRESSEE_ID = "10000000-0000-4000-8000-000000000003";

describe("friend-request outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    chain.select.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    database.from.mockReturnValue(chain);
    broadcastPrivateRealtimeEvent.mockResolvedValue(true);
  });

  it("broadcasts one claimed friendship event to exactly the two private user topics", async () => {
    let claimed = false;
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        if (claimed) return { data: [], error: null };
        claimed = true;
        return {
          data: [{
            id: "10000000-0000-4000-8000-000000000004",
            event_type: "friendship.requested",
            aggregate_id: FRIENDSHIP_ID,
            payload: {
              friendship_id: FRIENDSHIP_ID,
              requester_id: REQUESTER_ID,
              addressee_id: ADDRESSEE_ID,
              action: "requested",
            },
            attempts: 1,
          }],
          error: null,
        };
      }
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 0, completed: 0 });

    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [
        `sync:user:${REQUESTER_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "requested" },
      ],
      [
        `sync:user:${ADDRESSEE_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "requested" },
      ],
    ]);
  });

  it("broadcasts one accepted response event to both participants", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: "10000000-0000-4000-8000-000000000005",
            event_type: "friendship.responded",
            aggregate_id: FRIENDSHIP_ID,
            payload: {
              friendship_id: FRIENDSHIP_ID,
              requester_id: REQUESTER_ID,
              addressee_id: ADDRESSEE_ID,
              actor_id: ADDRESSEE_ID,
              action: "accepted",
            },
            attempts: 1,
          }],
          error: null,
        };
      }
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [
        `sync:user:${REQUESTER_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "accepted" },
      ],
      [
        `sync:user:${ADDRESSEE_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "accepted" },
      ],
    ]);
  });

  it("broadcasts removal to both participants and refund convergence only to its owner", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: "10000000-0000-4000-8000-000000000006",
            event_type: "friendship.removed",
            aggregate_id: FRIENDSHIP_ID,
            payload: {
              friendship_id: FRIENDSHIP_ID,
              requester_id: REQUESTER_ID,
              addressee_id: ADDRESSEE_ID,
              actor_id: REQUESTER_ID,
              action: "removed",
              source: "delete",
              refund_applied: true,
              refund_owner_id: REQUESTER_ID,
            },
            attempts: 1,
          }],
          error: null,
        };
      }
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [
        `sync:user:${REQUESTER_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "removed" },
      ],
      [
        `sync:user:${ADDRESSEE_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "removed" },
      ],
      [
        `sync:user:${REQUESTER_ID}`,
        "coins-changed",
        { changed: true, reason: "friendship_refund" },
      ],
    ]);
  });

  it("broadcasts a durable blocked event to both affected users", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: "10000000-0000-4000-8000-000000000007",
            event_type: "user.blocked",
            aggregate_id: "10000000-0000-4000-8000-000000000008",
            payload: {
              friendship_id: FRIENDSHIP_ID,
              requester_id: REQUESTER_ID,
              addressee_id: ADDRESSEE_ID,
              actor_id: REQUESTER_ID,
              action: "blocked",
            },
            attempts: 1,
          }],
          error: null,
        };
      }
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [
        `sync:user:${REQUESTER_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "blocked" },
      ],
      [
        `sync:user:${ADDRESSEE_ID}`,
        "friendships-changed",
        { changed: true, friendship_id: FRIENDSHIP_ID, action: "blocked" },
      ],
    ]);
  });

  it("broadcasts meeting coin convergence to exactly both awarded users", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") {
        return {
          data: [{
            id: "10000000-0000-4000-8000-000000000009",
            event_type: "coin.meeting_awarded",
            aggregate_id: "10000000-0000-4000-8000-000000000010",
            payload: {
              meeting_id: "10000000-0000-4000-8000-000000000010",
              user_a_id: REQUESTER_ID,
              user_b_id: ADDRESSEE_ID,
              action: "meeting_awarded",
            },
            attempts: 1,
          }],
          error: null,
        };
      }
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [
        `sync:user:${REQUESTER_ID}`,
        "coins-changed",
        {
          changed: true,
          reason: "meeting_awarded",
          meeting_id: "10000000-0000-4000-8000-000000000010",
        },
      ],
      [
        `sync:user:${ADDRESSEE_ID}`,
        "coins-changed",
        {
          changed: true,
          reason: "meeting_awarded",
          meeting_id: "10000000-0000-4000-8000-000000000010",
        },
      ],
    ]);
  });
});
