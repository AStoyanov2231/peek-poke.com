import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const profileMedia = vi.hoisted(() => ({
  handle: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/server/outbox/profile-media", () => ({
  handleProfileMediaModeration: profileMedia.handle,
  cleanupProfileMediaModerationOnDeadLetter: profileMedia.cleanup,
}));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects: vi.fn(),
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT_ID = "71000000-0000-4000-8000-000000000001";
const OPERATION_ID = "71000000-0000-4000-8000-000000000002";

const event = {
  id: EVENT_ID,
  event_type: "profile.media_moderation",
  aggregate_id: OPERATION_ID,
  payload: { operation_id: OPERATION_ID },
  attempts: 8,
};

describe("profile media retry exhaustion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const oldest = {
      select: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    oldest.select.mockReturnValue(oldest);
    oldest.in.mockReturnValue(oldest);
    oldest.order.mockReturnValue(oldest);
    oldest.limit.mockReturnValue(oldest);
    database.from.mockReturnValue(oldest);
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_outbox_events") return { data: [event], error: null };
      if (name === "complete_outbox_event") return { data: true, error: null };
      if (name === "retry_outbox_event") return { data: true, error: null };
      if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    event.attempts = 8;
    profileMedia.handle.mockRejectedValue(new Error("promotion failed"));
    profileMedia.cleanup.mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps an authorized publication live with capped backoff at attempt eight", async () => {
    await expect(processOutboxBatch()).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 1,
      dead: 0,
    });

    expect(profileMedia.cleanup).toHaveBeenCalledWith(database, event);
    const cleanupOrder = profileMedia.cleanup.mock.invocationCallOrder[0];
    const retryCall = database.rpc.mock.calls.find((call) => call[0] === "retry_outbox_event");
    expect(retryCall?.[1]).toEqual(expect.objectContaining({
      p_event_id: EVENT_ID,
      p_dead: false,
    }));
    expect(Date.parse(String(retryCall?.[1].p_available_at))).toBeGreaterThan(Date.now());
    const retryOrder = database.rpc.mock.invocationCallOrder[
      database.rpc.mock.calls.findIndex((call) => call[0] === "retry_outbox_event")
    ];
    expect(cleanupOrder).toBeLessThan(retryOrder);
  });

  it("keeps an authorized publication live at attempt one hundred", async () => {
    event.attempts = 100;

    await expect(processOutboxBatch()).resolves.toMatchObject({ retried: 1, dead: 0 });

    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT_ID,
      p_dead: false,
    }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(
      '"event":"profile_media_operation_retry_exhausted"',
    ));
  });

  it.each([8, 100])(
    "keeps a pending approval live at attempt %i",
    async (attempts) => {
      event.attempts = attempts;
      profileMedia.cleanup.mockResolvedValue(false);

      await expect(processOutboxBatch()).resolves.toMatchObject({ retried: 1, dead: 0 });

      expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
        p_event_id: EVENT_ID,
        p_dead: false,
      }));
    },
  );

  it("allows a safe nonpublication operation to dead-letter after fenced cleanup", async () => {
    profileMedia.cleanup.mockResolvedValue(true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ retried: 0, dead: 1 });

    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT_ID,
      p_dead: true,
    }));
  });

  it("converges when an operator-triggered worker replay succeeds after attempt one hundred", async () => {
    event.attempts = 100;
    profileMedia.handle
      .mockRejectedValueOnce(new Error("destination unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(processOutboxBatch()).resolves.toMatchObject({ retried: 1, dead: 0 });
    await expect(processOutboxBatch()).resolves.toMatchObject({ completed: 1, dead: 0 });

    expect(profileMedia.handle).toHaveBeenCalledTimes(2);
    expect(database.rpc).toHaveBeenCalledWith("complete_outbox_event", expect.objectContaining({
      p_event_id: EVENT_ID,
    }));
  });

  it("does not commit a dead-letter state when terminal cleanup fails", async () => {
    profileMedia.cleanup.mockRejectedValue(new Error("public cleanup failed"));

    await expect(processOutboxBatch()).rejects.toThrow("public cleanup failed");

    expect(database.rpc).not.toHaveBeenCalledWith(
      "retry_outbox_event",
      expect.anything(),
    );
  });
});
