import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const broadcastPrivateRealtimeEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects: vi.fn(),
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const SOURCE_ID = "50000000-0000-4000-8000-000000000001";
const PROFILE_ID = "50000000-0000-4000-8000-000000000002";
const OWNER_RECIPIENT = PROFILE_ID;
const PEER_RECIPIENT = "50000000-0000-4000-8000-000000000003";

function event(overrides: Record<string, unknown>) {
  return {
    id: SOURCE_ID,
    event_type: "profile.updated",
    aggregate_id: PROFILE_ID,
    payload: { profile_id: PROFILE_ID },
    attempts: 1,
    ...overrides,
  };
}

function configureRpc(
  events: unknown[],
  options: { expand?: number; complete?: boolean; deliverable?: boolean } = {},
) {
  database.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_outbox_events") return { data: events, error: null };
    if (name === "expand_profile_updated_event") {
      return { data: options.expand ?? 2, error: null };
    }
    if (name === "can_deliver_profile_updated_hint") {
      return { data: options.deliverable ?? true, error: null };
    }
    if (name === "complete_outbox_event") {
      return { data: options.complete ?? true, error: null };
    }
    if (name === "retry_outbox_event") return { data: true, error: null };
    if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

describe("durable profile update outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      select: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    chain.select.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    database.from.mockReturnValue(chain);
    broadcastPrivateRealtimeEvent.mockResolvedValue(true);
  });

  it.each(["profile.updated", "profile.updated.page"])(
    "expands a leased %s source into durable recipient rows before completion",
    async (eventType) => {
      configureRpc([event({ event_type: eventType })]);

      await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

      expect(database.rpc).toHaveBeenCalledWith("expand_profile_updated_event", {
        p_event_id: SOURCE_ID,
        p_worker_id: expect.stringMatching(/^vercel:/),
      });
      expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalled();
    },
  );

  it("broadcasts only a sanitized profile id to owner and counterpart private channels", async () => {
    configureRpc([
      event({
        id: "50000000-0000-4000-8000-000000000010",
        event_type: "profile.updated.hint",
        aggregate_id: OWNER_RECIPIENT,
        payload: {
          source_event_id: SOURCE_ID,
          profile_id: PROFILE_ID,
          recipient_id: OWNER_RECIPIENT,
          balance: 999,
          bio: "must not leak",
        },
      }),
      event({
        id: "50000000-0000-4000-8000-000000000011",
        event_type: "profile.updated.hint",
        aggregate_id: PEER_RECIPIENT,
        payload: {
          source_event_id: SOURCE_ID,
          profile_id: PROFILE_ID,
          recipient_id: PEER_RECIPIENT,
        },
      }),
    ]);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 2, completed: 2 });

    expect(broadcastPrivateRealtimeEvent.mock.calls).toEqual([
      [`sync:user:${OWNER_RECIPIENT}`, "profile-changed", { profile_id: PROFILE_ID }],
      [`sync:user:${PEER_RECIPIENT}`, "profile-changed", { profile_id: PROFILE_ID }],
    ]);
    expect(JSON.stringify(broadcastPrivateRealtimeEvent.mock.calls)).not.toContain("balance");
    expect(JSON.stringify(broadcastPrivateRealtimeEvent.mock.calls)).not.toContain("must not leak");
  });

  it("retries a failed recipient broadcast without completing or notifying a nonrecipient", async () => {
    const recipientEvent = event({
      id: "50000000-0000-4000-8000-000000000012",
      event_type: "profile.updated.hint",
      aggregate_id: PEER_RECIPIENT,
      payload: {
        source_event_id: SOURCE_ID,
        profile_id: PROFILE_ID,
        recipient_id: PEER_RECIPIENT,
      },
    });
    configureRpc([recipientEvent]);
    broadcastPrivateRealtimeEvent.mockResolvedValue(false);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, retried: 1, completed: 0 });

    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: recipientEvent.id,
      p_dead: false,
    }));
    expect(database.rpc).not.toHaveBeenCalledWith("complete_outbox_event", expect.anything());
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledTimes(1);
    expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalledWith(
      "sync:user:50000000-0000-4000-8000-000000000099",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    "blocked after expansion",
    "deleted after expansion",
    "disconnected after friendship removal with no DM",
    "unrelated forged child",
  ])(
    "drops and safely completes a child that became %s before delivery",
    async () => {
      const recipientEvent = event({
        id: "50000000-0000-4000-8000-000000000014",
        event_type: "profile.updated.hint",
        aggregate_id: PEER_RECIPIENT,
        payload: {
          source_event_id: SOURCE_ID,
          profile_id: PROFILE_ID,
          recipient_id: PEER_RECIPIENT,
        },
      });
      configureRpc([recipientEvent], { deliverable: false });

      await expect(processOutboxBatch()).resolves.toMatchObject({
        claimed: 1,
        completed: 1,
        retried: 0,
      });

      expect(database.rpc).toHaveBeenCalledWith("can_deliver_profile_updated_hint", {
        p_profile_id: PROFILE_ID,
        p_recipient_id: PEER_RECIPIENT,
      });
      expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalled();
      expect(database.rpc).toHaveBeenCalledWith("complete_outbox_event", expect.objectContaining({
        p_event_id: recipientEvent.id,
      }));
    },
  );

  it("delivers a child after friendship removal when a current DM still authorizes the pair", async () => {
    const recipientEvent = event({
      id: "50000000-0000-4000-8000-000000000015",
      event_type: "profile.updated.hint",
      aggregate_id: PEER_RECIPIENT,
      payload: {
        source_event_id: SOURCE_ID,
        profile_id: PROFILE_ID,
        recipient_id: PEER_RECIPIENT,
      },
    });
    configureRpc([recipientEvent], { deliverable: true });

    await expect(processOutboxBatch()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
    });

    expect(database.rpc).toHaveBeenCalledWith("can_deliver_profile_updated_hint", {
      p_profile_id: PROFILE_ID,
      p_recipient_id: PEER_RECIPIENT,
    });
    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(
      `sync:user:${PEER_RECIPIENT}`,
      "profile-changed",
      { profile_id: PROFILE_ID },
    );
  });

  it("rejects a recipient/aggregate mismatch and routes it through bounded retry", async () => {
    configureRpc([event({
      id: "50000000-0000-4000-8000-000000000013",
      event_type: "profile.updated.hint",
      aggregate_id: OWNER_RECIPIENT,
      payload: { profile_id: PROFILE_ID, recipient_id: PEER_RECIPIENT },
    })]);

    await expect(processOutboxBatch()).resolves.toMatchObject({ retried: 1, completed: 0 });
    expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalled();
  });
});
