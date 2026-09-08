import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const broadcastPrivateRealtimeEvent = vi.hoisted(() => vi.fn());
const sendPushToUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects: vi.fn(),
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const POKE_ID = "10000000-0000-4000-8000-000000000002";
const SENDER_ID = "10000000-0000-4000-8000-000000000003";
const RECIPIENT_ID = "10000000-0000-4000-8000-000000000004";
const THREAD_ID = "10000000-0000-4000-8000-000000000005";

function event(action: "received" | "accepted") {
  return {
    id: EVENT_ID,
    event_type: action === "received" ? "poke.created" : "poke.accepted",
    aggregate_id: POKE_ID,
    attempts: 1,
    payload: {
      poke_id: POKE_ID,
      sender_id: SENDER_ID,
      recipient_id: RECIPIENT_ID,
      action,
      ...(action === "accepted" ? { thread_id: THREAD_ID } : {}),
    },
  };
}

function install(action: "received" | "accepted", authorization: unknown = { deliver: true }) {
  database.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_outbox_events") return { data: [event(action)], error: null };
    if (name === "authorize_poke_delivery") {
      expect(args).toEqual({
        p_poke_id: POKE_ID,
        p_action: action,
        p_sender_id: SENDER_ID,
        p_recipient_id: RECIPIENT_ID,
        p_thread_id: action === "accepted" ? THREAD_ID : null,
      });
      return { data: authorization, error: null };
    }
    if (name === "complete_outbox_event") return { data: true, error: null };
    if (name === "retry_outbox_event") return { data: true, error: null };
    if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

describe("Poke outbox delivery", () => {
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
    sendPushToUser.mockResolvedValue(undefined);
  });

  it("delivers a generic received Poke only to the recipient inbox", async () => {
    install("received");

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(
      `sync:user:${RECIPIENT_ID}`,
      "social-changed",
      { changed: true, resource: "pokes", action: "received", poke_id: POKE_ID },
    );
    expect(sendPushToUser).toHaveBeenCalledWith(RECIPIENT_ID, {
      title: "New Poke",
      body: "You have a new invitation",
      route: "/inbox",
      data: { kind: "poke", pokeId: POKE_ID, action: "received" },
    });
  });

  it("delivers an accepted Poke only to the sender's chat handoff", async () => {
    install("accepted");

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent).toHaveBeenCalledWith(
      `sync:user:${SENDER_ID}`,
      "social-changed",
      { changed: true, resource: "pokes", action: "accepted", poke_id: POKE_ID, thread_id: THREAD_ID },
    );
    expect(sendPushToUser).toHaveBeenCalledWith(SENDER_ID, {
      title: "Poke accepted",
      body: "Your invitation was accepted",
      route: `/chat/${THREAD_ID}`,
      threadId: THREAD_ID,
      data: { kind: "poke", pokeId: POKE_ID, action: "accepted", threadId: THREAD_ID },
    });
  });

  it("completes without fanout when the last-moment authorization check suppresses delivery", async () => {
    install("received", { deliver: false });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(broadcastPrivateRealtimeEvent).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
