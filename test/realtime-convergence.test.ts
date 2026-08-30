import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createActiveQueryRecoveryScheduler,
  createRealtimeConvergenceBatcher,
  createUserSyncChannel,
  PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
  profileUpdatedHintSchema,
} from "@peekpoke/shared";

afterEach(() => {
  vi.useRealTimers();
});

describe("cross-platform Realtime convergence batching", () => {
  it("accepts only a sanitized UUID profile hint", () => {
    expect(profileUpdatedHintSchema.parse({
      profile_id: "11111111-1111-4111-8111-111111111111",
    })).toEqual({ profile_id: "11111111-1111-4111-8111-111111111111" });
    expect(profileUpdatedHintSchema.safeParse({ changed: true }).success).toBe(false);
    expect(profileUpdatedHintSchema.safeParse({
      profile_id: "11111111-1111-4111-8111-111111111111",
      display_name: "Private payload",
    }).success).toBe(false);
  });

  it("bounds public, search, and nearby recovery to active, visible, online queries", async () => {
    vi.useFakeTimers();
    const activeKinds = new Set<string>();
    let visible = true;
    let online = true;
    const recover = vi.fn();
    const scheduler = createActiveQueryRecoveryScheduler({
      intervalMs: PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
      isEligible: () => visible && online && activeKinds.size > 0,
      onRecover: recover,
    });

    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS * 2);
    expect(recover).not.toHaveBeenCalled();

    activeKinds.add("public");
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS - 1);
    expect(recover).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(recover).toHaveBeenCalledTimes(1);

    visible = false;
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS * 2);
    expect(recover).toHaveBeenCalledTimes(1);

    visible = true;
    online = false;
    activeKinds.clear();
    activeKinds.add("search");
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS * 2);
    expect(recover).toHaveBeenCalledTimes(1);

    online = true;
    activeKinds.clear();
    activeKinds.add("nearby");
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS);
    expect(recover).toHaveBeenCalledTimes(2);

    activeKinds.clear();
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS * 2);
    expect(recover).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });
  it("creates one per-user channel carrying message, friendship, and coin hints", () => {
    const channel = { id: "single-channel" };
    const createChannel = vi.fn(() => channel);
    const registrations: Array<{ channel: typeof channel; event: string }> = [];
    const messageHandler = vi.fn();
    const friendshipHandler = vi.fn();
    const coinHandler = vi.fn();
    const profileHandler = vi.fn();

    const result = createUserSyncChannel({
      userId: "user-a",
      createChannel,
      onBroadcast: (registeredChannel, event) => {
        registrations.push({ channel: registeredChannel, event });
      },
      onMessagesChanged: messageHandler,
      onFriendshipsChanged: friendshipHandler,
      onCoinsChanged: coinHandler,
      onProfileChanged: profileHandler,
    });

    expect(result).toBe(channel);
    expect(createChannel).toHaveBeenCalledOnce();
    expect(createChannel).toHaveBeenCalledWith("sync:user:user-a");
    expect(registrations).toEqual([
      { channel, event: "messages-changed" },
      { channel, event: "friendships-changed" },
      { channel, event: "coins-changed" },
      { channel, event: "profile-changed" },
    ]);
  });

  it("recovers both event streams after errors, reconnect, and foreground", async () => {
    vi.useFakeTimers();
    const handlers = new Map<string, (payload: unknown) => void>();
    const messageFlush = vi.fn();
    const friendshipFlush = vi.fn();
    const coinFlush = vi.fn();
    const messages = createRealtimeConvergenceBatcher({
      delayMs: 10,
      onFlush: messageFlush,
    });
    const friendships = createRealtimeConvergenceBatcher({
      delayMs: 20,
      onFlush: friendshipFlush,
    });
    const coins = createRealtimeConvergenceBatcher({
      delayMs: 20,
      onFlush: coinFlush,
    });

    createUserSyncChannel({
      userId: "user-a",
      createChannel: () => ({ id: "one-user-channel" }),
      onBroadcast: (_channel, event, handler) => handlers.set(event, handler),
      onMessagesChanged: () => messages.hint("thread-a"),
      onFriendshipsChanged: () => friendships.hint("friendships"),
      onCoinsChanged: () => coins.hint("coins"),
      onProfileChanged: () => undefined,
    });

    handlers.get("messages-changed")?.({ sequence: 3 });
    handlers.get("messages-changed")?.({ sequence: 2 });
    handlers.get("friendships-changed")?.({ action: "accepted" });
    handlers.get("friendships-changed")?.({ action: "accepted" });
    handlers.get("coins-changed")?.({ reason: "friendship_refund" });
    handlers.get("coins-changed")?.({ reason: "friendship_refund" });
    await vi.advanceTimersByTimeAsync(20);
    expect(messageFlush).toHaveBeenCalledTimes(1);
    expect(friendshipFlush).toHaveBeenCalledTimes(1);
    expect(coinFlush).toHaveBeenCalledTimes(1);

    messages.subscriptionStatus("CHANNEL_ERROR");
    friendships.subscriptionStatus("CHANNEL_ERROR");
    coins.subscriptionStatus("CHANNEL_ERROR");
    messages.subscriptionStatus("SUBSCRIBED");
    friendships.subscriptionStatus("SUBSCRIBED");
    coins.subscriptionStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(20);
    expect(messageFlush).toHaveBeenCalledTimes(2);
    expect(friendshipFlush).toHaveBeenCalledTimes(2);
    expect(coinFlush).toHaveBeenCalledTimes(2);

    messages.recover();
    friendships.recover();
    coins.recover();
    await vi.advanceTimersByTimeAsync(20);
    expect(messageFlush).toHaveBeenCalledTimes(3);
    expect(friendshipFlush).toHaveBeenCalledTimes(3);
    expect(coinFlush).toHaveBeenCalledTimes(3);

    messages.dispose();
    friendships.dispose();
    coins.dispose();
    handlers.get("messages-changed")?.({ sequence: 4 });
    handlers.get("friendships-changed")?.({ action: "removed" });
    handlers.get("coins-changed")?.({ reason: "friendship_refund" });
    await vi.advanceTimersByTimeAsync(100);
    expect(messageFlush).toHaveBeenCalledTimes(3);
    expect(friendshipFlush).toHaveBeenCalledTimes(3);
    expect(coinFlush).toHaveBeenCalledTimes(3);
  });

  it("coalesces duplicate and out-of-order thread hints into one durable batch", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createRealtimeConvergenceBatcher({ delayMs: 500, onFlush: flush });

    batcher.hint("thread-b");
    batcher.hint("thread-a");
    batcher.hint("thread-b");

    await vi.advanceTimersByTimeAsync(500);

    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0]?.[0]).toEqual({
      recovery: false,
      threadIds: ["thread-b", "thread-a"],
    });
  });

  it("backfills once after initial subscribe and once after disconnect/reconnect", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createRealtimeConvergenceBatcher({ delayMs: 100, onFlush: flush });

    batcher.subscriptionStatus("SUBSCRIBED");
    batcher.subscriptionStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(100);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toEqual({ recovery: true, threadIds: [] });

    batcher.subscriptionStatus("CLOSED");
    batcher.subscriptionStatus("CHANNEL_ERROR");
    batcher.subscriptionStatus("TIMED_OUT");
    batcher.subscriptionStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(100);

    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1]?.[0]).toEqual({ recovery: true, threadIds: [] });
  });

  it("coalesces foreground recovery with pending message hints", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const batcher = createRealtimeConvergenceBatcher({ delayMs: 50, onFlush: flush });

    batcher.hint("thread-a");
    batcher.recover();
    batcher.recover();
    await vi.advanceTimersByTimeAsync(50);

    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0]?.[0]).toEqual({
      recovery: true,
      threadIds: ["thread-a"],
    });
  });

  it("aborts in-flight work and ignores stale callbacks after session cleanup", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    let activeSignal: AbortSignal | undefined;
    const flush = vi.fn((_batch, signal: AbortSignal) => {
      activeSignal = signal;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const batcher = createRealtimeConvergenceBatcher({ delayMs: 10, onFlush: flush });

    batcher.hint("old-user-thread");
    await vi.advanceTimersByTimeAsync(10);
    expect(activeSignal?.aborted).toBe(false);

    batcher.dispose();
    expect(activeSignal?.aborted).toBe(true);
    batcher.hint("new-user-thread");
    batcher.subscriptionStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(100);
    release?.();
    await Promise.resolve();

    expect(flush).toHaveBeenCalledOnce();
  });

  it("reports recovery failures without creating an unhandled rejection", async () => {
    vi.useFakeTimers();
    const error = new Error("durable refresh failed");
    const onError = vi.fn();
    const batcher = createRealtimeConvergenceBatcher({
      delayMs: 10,
      onFlush: async () => {
        throw error;
      },
      onError,
    });

    batcher.recover();
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledWith(error);
  });
});
