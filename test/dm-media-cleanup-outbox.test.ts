import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const eraseStorageObjects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => database }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastPrivateRealtimeEvent: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({
  deleteStripeCustomer: vi.fn(),
  eraseStorageObjects,
}));

import { processOutboxBatch } from "@/server/outbox/worker";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const CLEANUP = "55555555-5555-4555-8555-555555555555";
const STEM = "1722501296789-550e8400-e29b-41d4-a716-446655440000";
const FOREIGN_STEM = "1722501296790-660e8400-e29b-41d4-a716-446655440000";
const MAIN_DIGEST = "a".repeat(64);
const THUMBNAIL_DIGEST = "b".repeat(64);

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    event_type: "dm.media_cleanup",
    aggregate_id: MESSAGE,
    attempts: 1,
    payload: {
      cleanup_id: CLEANUP,
      actor_id: ACTOR,
      thread_id: THREAD,
      message_id: MESSAGE,
      sequence: 7,
      main_path: `${ACTOR}/${STEM}.jpg`,
      main_object_digest: MAIN_DIGEST,
      thumbnail_path: `${ACTOR}/${STEM}_thumb.webp`,
      thumbnail_object_digest: THUMBNAIL_DIGEST,
      ...overrides,
    },
  };
}

function configure(
  events: unknown[],
  authorized: boolean,
  options: { completeError?: boolean } = {},
) {
  database.rpc.mockImplementation(async (name: string, args: unknown) => {
    if (name === "claim_outbox_events") return { data: events, error: null };
    if (name === "authorize_dm_media_cleanup") {
      expect(args).toEqual({
        p_event_id: EVENT,
        p_cleanup_id: CLEANUP,
        p_actor_id: ACTOR,
        p_thread_id: THREAD,
        p_message_id: MESSAGE,
        p_sequence: 7,
        p_main_path: expect.any(String),
        p_main_object_digest: MAIN_DIGEST,
        p_thumbnail_path: expect.any(String),
        p_thumbnail_object_digest: THUMBNAIL_DIGEST,
      });
      return { data: authorized, error: null };
    }
    if (name === "complete_outbox_event") {
      return options.completeError
        ? { data: null, error: { message: "completion response lost" } }
        : { data: true, error: null };
    }
    if (name === "retry_outbox_event") return { data: true, error: null };
    if (name === "cleanup_completed_workflow_rows") return { data: 0, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

describe("durable DM media cleanup", () => {
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
    eraseStorageObjects.mockResolvedValue(2);
  });

  afterEach(() => vi.restoreAllMocks());

  it("deletes only the exact positional snapshot after database authorization", async () => {
    configure([event()], true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });

    expect(eraseStorageObjects).toHaveBeenCalledWith(database, [
      { bucket: "media", path: `${ACTOR}/${STEM}.jpg` },
      { bucket: "media", path: `${ACTOR}/${STEM}_thumb.webp` },
    ]);
  });

  it("completes without Storage deletion when the message fence is stale", async () => {
    configure([event()], false);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(eraseStorageObjects).not.toHaveBeenCalled();
  });

  it("does not delete a same-owner foreign message path or a replaced object generation", async () => {
    const foreign = event({
      main_path: `${ACTOR}/${FOREIGN_STEM}.jpg`,
      thumbnail_path: `${ACTOR}/${FOREIGN_STEM}_thumb.webp`,
    });
    configure([foreign], false);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(database.rpc).toHaveBeenCalledWith(
      "authorize_dm_media_cleanup",
      expect.objectContaining({ p_main_path: `${ACTOR}/${FOREIGN_STEM}.jpg` }),
    );
    expect(eraseStorageObjects).not.toHaveBeenCalled();

    vi.clearAllMocks();
    configure([event()], false);
    database.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(eraseStorageObjects).not.toHaveBeenCalled();
  });

  it("retries an idempotent remove after a crash loses the completion response", async () => {
    configure([event()], true, { completeError: true });

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, retried: 1 });
    expect(eraseStorageObjects).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    configure([event()], true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(eraseStorageObjects).toHaveBeenCalledTimes(1);
  });

  it("keeps duplicate workers harmless while the permanent path fence prevents reuse", async () => {
    configure([event(), event()], true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 2, completed: 2 });
    expect(eraseStorageObjects).toHaveBeenCalledTimes(2);
  });

  it("dead-letters a failed remove without releasing the permanent path generation", async () => {
    configure([{ ...event(), attempts: 8 }], true);
    eraseStorageObjects.mockRejectedValue(new Error("Storage unavailable"));

    await expect(processOutboxBatch()).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 0,
      dead: 1,
    });
    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT,
      p_dead: true,
    }));
  });

  it.each([
    ["missing", { thumbnail_path: undefined }],
    ["extra", { extra_path: `${ACTOR}/${FOREIGN_STEM}.jpg` }],
    ["swapped", {
      main_path: `${ACTOR}/${STEM}_thumb.webp`,
      thumbnail_path: `${ACTOR}/${STEM}.jpg`,
    }],
    ["encoded", { main_path: `${ACTOR}/%31${STEM.slice(1)}.jpg` }],
    ["case", { main_path: `${ACTOR}/${STEM.replace("550e", "550E")}.jpg` }],
    ["path variant", { main_path: `${ACTOR}/nested/../${STEM}.jpg` }],
  ])("retries without authorization for a %s path set", async (_label, overrides) => {
    const malformed = event(overrides);
    if (overrides.thumbnail_path === undefined) {
      delete malformed.payload.thumbnail_path;
    }
    configure([malformed], true);

    await expect(processOutboxBatch()).resolves.toMatchObject({ claimed: 1, retried: 1, completed: 0 });
    expect(eraseStorageObjects).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalledWith("authorize_dm_media_cleanup", expect.anything());
    expect(database.rpc).toHaveBeenCalledWith("retry_outbox_event", expect.objectContaining({
      p_event_id: EVENT,
      p_dead: false,
    }));
  });
});
