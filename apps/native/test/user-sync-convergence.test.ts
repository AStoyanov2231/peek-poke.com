import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createActiveQueryRecoveryScheduler,
  createRealtimeConvergenceBatcher,
  createUserSyncChannel,
  PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
  profileUpdatedHintSchema,
} from "@peekpoke/shared";

afterEach(() => vi.useRealTimers());

describe("native per-user Realtime convergence", () => {
  it("uses the same strict sanitized profile hint contract on iOS and Android", () => {
    expect(profileUpdatedHintSchema.safeParse({
      profile_id: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(true);
    expect(profileUpdatedHintSchema.safeParse({ changed: true }).success).toBe(false);
    expect(profileUpdatedHintSchema.safeParse({
      profile_id: "11111111-1111-4111-8111-111111111111",
      balance: 1,
    }).success).toBe(false);
  });

  it("uses fake time to stop iOS/Android profile recovery offscreen or offline", async () => {
    vi.useFakeTimers();
    let appActive = true;
    let online = true;
    let hasActiveProfileQuery = false;
    const recover = vi.fn();
    const scheduler = createActiveQueryRecoveryScheduler({
      intervalMs: PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
      isEligible: () => appActive && online && hasActiveProfileQuery,
      onRecover: recover,
    });

    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS);
    expect(recover).not.toHaveBeenCalled();

    hasActiveProfileQuery = true;
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS);
    expect(recover).toHaveBeenCalledOnce();

    appActive = false;
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS);
    expect(recover).toHaveBeenCalledOnce();

    appActive = true;
    online = false;
    scheduler.reevaluate();
    await vi.advanceTimersByTimeAsync(PROFILE_REFERENCE_RECOVERY_INTERVAL_MS);
    expect(recover).toHaveBeenCalledOnce();
    scheduler.dispose();
  });
  it("uses one channel for message, friendship, and coin recovery with duplicate coalescing", async () => {
    vi.useFakeTimers();
    const createChannel = vi.fn(() => ({ id: "native-user-channel" }));
    const handlers = new Map<string, (payload: unknown) => void>();
    const messageRefresh = vi.fn();
    const socialRefresh = vi.fn();
    const coinRefresh = vi.fn();
    const messages = createRealtimeConvergenceBatcher({ delayMs: 10, onFlush: messageRefresh });
    const friendships = createRealtimeConvergenceBatcher({ delayMs: 20, onFlush: socialRefresh });
    const coins = createRealtimeConvergenceBatcher({ delayMs: 20, onFlush: coinRefresh });

    createUserSyncChannel({
      userId: "native-user",
      createChannel,
      onBroadcast: (_channel, event, handler) => handlers.set(event, handler),
      onMessagesChanged: () => messages.hint("thread-a"),
      onFriendshipsChanged: () => friendships.hint("friendships"),
      onCoinsChanged: () => coins.hint("coins"),
      onProfileChanged: () => undefined,
    });

    handlers.get("messages-changed")?.({ sequence: 5 });
    handlers.get("messages-changed")?.({ sequence: 4 });
    handlers.get("friendships-changed")?.({ action: "accepted" });
    handlers.get("friendships-changed")?.({ action: "accepted" });
    handlers.get("coins-changed")?.({ reason: "friendship_refund" });
    handlers.get("coins-changed")?.({ reason: "friendship_refund" });
    await vi.advanceTimersByTimeAsync(20);

    expect(createChannel).toHaveBeenCalledOnce();
    expect(messageRefresh).toHaveBeenCalledOnce();
    expect(socialRefresh).toHaveBeenCalledOnce();
    expect(coinRefresh).toHaveBeenCalledOnce();

    messages.subscriptionStatus("TIMED_OUT");
    friendships.subscriptionStatus("TIMED_OUT");
    coins.subscriptionStatus("TIMED_OUT");
    messages.subscriptionStatus("SUBSCRIBED");
    friendships.subscriptionStatus("SUBSCRIBED");
    coins.subscriptionStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(20);
    expect(messageRefresh).toHaveBeenCalledTimes(2);
    expect(socialRefresh).toHaveBeenCalledTimes(2);
    expect(coinRefresh).toHaveBeenCalledTimes(2);

    messages.recover();
    friendships.recover();
    coins.recover();
    await vi.advanceTimersByTimeAsync(20);
    expect(messageRefresh).toHaveBeenCalledTimes(3);
    expect(socialRefresh).toHaveBeenCalledTimes(3);
    expect(coinRefresh).toHaveBeenCalledTimes(3);

    messages.dispose();
    friendships.dispose();
    coins.dispose();
  });
});
