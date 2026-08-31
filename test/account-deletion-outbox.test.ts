import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })) } },
}));
const eraseStorageObjects = vi.hoisted(() => vi.fn(async () => 0));
const deleteStripeCustomer = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastPrivateRealtimeEvent: vi.fn(),
  notifyRoomMessagesChanged: vi.fn(async () => true),
  notifyRoomUnreadChanged: vi.fn(async () => true),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/account-deletion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account-deletion")>();
  return { ...actual, deleteStripeCustomer, eraseStorageObjects };
});

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function accountEvent() {
  return {
    id: EVENT_ID,
    event_type: "account.cleanup",
    aggregate_id: JOB_ID,
    attempts: 1,
    payload: { job_id: JOB_ID, user_id: USER_ID },
  };
}

function configure(storageObjects: unknown) {
  database.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_outbox_events") return { data: [accountEvent()], error: null };
    if (name === "complete_outbox_event") return { data: true, error: null };
    if (name === "retry_outbox_event") return { data: true, error: null };
    if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });

  database.from.mockImplementation((table: string) => {
    if (table === "outbox_events") {
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
      return chain;
    }
    if (table === "account_deletion_jobs") {
      const chain = {
        select: vi.fn(),
        update: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: JOB_ID,
            stripe_customer_id: "cus_worker",
            storage_objects: storageObjects,
            status: "pending",
          },
          error: null,
        })),
      };
      chain.select.mockReturnValue(chain);
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      return chain;
    }
    if (table === "chat_room_messages") {
      return {
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("account deletion outbox snapshot consumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eraseStorageObjects.mockResolvedValue(2);
  });

  it("consumes only the strict snapshot persisted by the atomic queue", async () => {
    const snapshot = [
      { bucket: "approved-profile-photos", path: `${USER_ID}/profile.jpg` },
      { bucket: "media", path: `${USER_ID}/claimed.jpg` },
    ];
    configure(snapshot);

    await expect(processOutboxBatch()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
    });
    expect(deleteStripeCustomer).toHaveBeenCalledWith("cus_worker");
    expect(eraseStorageObjects).toHaveBeenCalledWith(database, snapshot);
  });

  it("retries without deleting anything when a persisted snapshot is malformed", async () => {
    configure([
      { bucket: "media", path: `${USER_ID}/claimed.jpg` },
      { bucket: "media", path: `${USER_ID}/../foreign.jpg` },
    ]);

    await expect(processOutboxBatch()).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 1,
    });
    expect(eraseStorageObjects).not.toHaveBeenCalled();
    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT_ID,
      p_dead: false,
    }));
  });
});
