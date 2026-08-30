export type RealtimeSubscriptionStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

export type RealtimeConvergenceBatch = {
  recovery: boolean;
  threadIds: readonly string[];
};

export const USER_SYNC_BROADCAST_EVENTS = {
  messages: "messages-changed",
  friendships: "friendships-changed",
  coins: "coins-changed",
  profile: "profile-changed",
} as const;

export const PROFILE_REFERENCE_RECOVERY_INTERVAL_MS = 30_000;

type ActiveQueryRecoverySchedulerOptions = {
  intervalMs: number;
  isEligible: () => boolean;
  onRecover: (signal: AbortSignal) => void | Promise<void>;
  onError?: (error: unknown) => void;
};

/** Runs bounded API recovery only while at least one relevant query is active. */
export function createActiveQueryRecoveryScheduler({
  intervalMs,
  isEligible,
  onRecover,
  onError,
}: ActiveQueryRecoverySchedulerOptions) {
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  const schedule = () => {
    if (disposed || running || timer || !isEligible()) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, intervalMs);
  };

  const run = async () => {
    if (disposed || running || !isEligible()) return;
    running = true;
    const activeController = new AbortController();
    controller = activeController;
    try {
      await onRecover(activeController.signal);
    } catch (error) {
      if (!activeController.signal.aborted) onError?.(error);
    } finally {
      if (controller === activeController) controller = null;
      running = false;
      schedule();
    }
  };

  return {
    reevaluate() {
      if (disposed) return;
      if (!isEligible()) {
        stop();
        return;
      }
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
    },
  };
}

export function userSyncChannelName(userId: string) {
  return `sync:user:${userId}`;
}

type CreateUserSyncChannelOptions<TChannel> = {
  userId: string;
  createChannel: (name: string) => TChannel;
  onBroadcast: (
    channel: TChannel,
    event: string,
    handler: (payload: unknown) => void,
  ) => void;
  onMessagesChanged: (payload: unknown) => void;
  onFriendshipsChanged: (payload: unknown) => void;
  onCoinsChanged: (payload: unknown) => void;
  onProfileChanged: (payload: unknown) => void;
};

/** Creates the single private per-user channel shared by message, social, and coin hints. */
export function createUserSyncChannel<TChannel>({
  userId,
  createChannel,
  onBroadcast,
  onMessagesChanged,
  onFriendshipsChanged,
  onCoinsChanged,
  onProfileChanged,
}: CreateUserSyncChannelOptions<TChannel>) {
  const channel = createChannel(userSyncChannelName(userId));
  onBroadcast(
    channel,
    USER_SYNC_BROADCAST_EVENTS.messages,
    onMessagesChanged,
  );
  onBroadcast(
    channel,
    USER_SYNC_BROADCAST_EVENTS.friendships,
    onFriendshipsChanged,
  );
  onBroadcast(
    channel,
    USER_SYNC_BROADCAST_EVENTS.coins,
    onCoinsChanged,
  );
  onBroadcast(
    channel,
    USER_SYNC_BROADCAST_EVENTS.profile,
    onProfileChanged,
  );
  return channel;
}

type RealtimeConvergenceBatcherOptions = {
  delayMs: number;
  onFlush: (
    batch: RealtimeConvergenceBatch,
    signal: AbortSignal,
  ) => void | Promise<void>;
  onError?: (error: unknown) => void;
};

/**
 * Coalesces lossy Realtime hints into bounded durable refresh batches.
 * The caller owns the API/query work; this helper only manages lifecycle,
 * reconnect recovery, and cancellation.
 */
export function createRealtimeConvergenceBatcher({
  delayMs,
  onFlush,
  onError,
}: RealtimeConvergenceBatcherOptions) {
  const pendingThreadIds = new Set<string>();
  let recoveryPending = false;
  let subscribed = false;
  let disposed = false;
  let flushing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeAbortController: AbortController | null = null;

  const hasPendingWork = () => recoveryPending || pendingThreadIds.size > 0;

  const schedule = () => {
    if (disposed || timer || !hasPendingWork()) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
  };

  const flush = async () => {
    if (disposed || flushing || !hasPendingWork()) return;

    const batch: RealtimeConvergenceBatch = {
      recovery: recoveryPending,
      threadIds: [...pendingThreadIds],
    };
    recoveryPending = false;
    pendingThreadIds.clear();
    flushing = true;
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      await onFlush(batch, abortController.signal);
    } catch (error) {
      if (!abortController.signal.aborted) onError?.(error);
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      flushing = false;
      schedule();
    }
  };

  return {
    hint(threadId: string) {
      if (disposed) return;
      pendingThreadIds.add(threadId);
      schedule();
    },
    recover() {
      if (disposed) return;
      recoveryPending = true;
      schedule();
    },
    subscriptionStatus(status: RealtimeSubscriptionStatus) {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (!subscribed) {
          recoveryPending = true;
          schedule();
        }
        subscribed = true;
        return;
      }
      subscribed = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pendingThreadIds.clear();
      recoveryPending = false;
      activeAbortController?.abort();
      activeAbortController = null;
    },
  };
}
