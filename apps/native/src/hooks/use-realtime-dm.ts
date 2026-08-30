import { useEffect, useRef } from "react";
import { onlineManager, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  createActiveQueryRecoveryScheduler,
  createRealtimeConvergenceBatcher,
  createUserSyncChannel,
  messageHintSchema,
  PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
  profileUpdatedHintSchema,
  type RealtimeSubscriptionStatus,
} from "@peekpoke/shared";
import { AppState } from "react-native";
import { fetchMessages, type MessagesData } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/state/app-store";
import {
  isNativeProfileRecoveryQuery,
  refreshActiveNativeProfileQueries,
  refreshNativeProfileReferences,
} from "@/data/profile/cache";
import { markActiveThreadRead } from "@/data/read-receipt";

const FOREGROUND_REFRESH_MS = 30_000;
const THREAD_REFRESH_DEBOUNCE_MS = 500;
const FRIENDS_REFRESH_DEBOUNCE_MS = 1_500;
const COINS_REFRESH_DEBOUNCE_MS = 1_500;
const PROFILE_REFRESH_DEBOUNCE_MS = 500;
const FRIENDSHIP_HINT_KEY = "friendships";
const PROFILE_CURRENT_QUERY_KEY = nativeQueryKeys.profile.current;

function parseMessageHint(payload: unknown) {
  const value = payload && typeof payload === "object"
    ? (payload as { payload?: unknown }).payload
    : null;
  const parsed = messageHintSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseProfileHint(payload: unknown) {
  const value = payload && typeof payload === "object"
    ? (payload as { payload?: unknown }).payload
    : null;
  const parsed = profileUpdatedHintSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function canRefreshActiveNativeQueries() {
  return AppState.currentState === "active" && onlineManager.isOnline();
}

/**
 * Realtime is only a private, per-user invalidation hint. The versioned API
 * remains the durable source of thread, message, and friendship state.
 */
export function useRealtimeUserSync(userId: string | undefined) {
  const queryClient = useQueryClient();
  const lastForegroundRefresh = useRef(0);

  // Supabase's channel is unsubscribed and removed in the cleanup below; the
  // scanner cannot pair the fluent `.on()` allocation with that cleanup.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!userId) return;

    const convergence = createRealtimeConvergenceBatcher({
      delayMs: THREAD_REFRESH_DEBOUNCE_MS,
      onError: (error) => console.warn("Message realtime recovery failed", error),
      onFlush: async ({ recovery, threadIds }, signal) => {
        await queryClient.invalidateQueries({
          queryKey: nativeQueryKeys.inbox.threads,
          exact: true,
          refetchType: "none",
        });
        if (signal.aborted) return;
        const activeThreadId = useAppStore.getState().activeThreadId;
        const hintedActiveThread = activeThreadId && threadIds.includes(activeThreadId)
          ? activeThreadId
          : null;
        const threadToBackfill = hintedActiveThread ?? (recovery ? activeThreadId : null);

        for (const threadId of threadIds) {
          if (threadId === threadToBackfill) continue;
          queryClient.removeQueries({
            queryKey: nativeQueryKeys.chat.messages(threadId),
            exact: true,
            type: "inactive",
          });
        }
        if (recovery) {
          queryClient.removeQueries({
            queryKey: nativeQueryKeys.chat.all,
            exact: false,
            type: "inactive",
          });
        }

        const durableReads: Promise<unknown>[] = [
          queryClient.refetchQueries({
            queryKey: nativeQueryKeys.inbox.threads,
            exact: true,
            type: "active",
          }),
        ];

        if (threadToBackfill) {
          await queryClient.invalidateQueries({
            queryKey: nativeQueryKeys.chat.messages(threadToBackfill),
            exact: true,
            refetchType: "none",
          });
          if (signal.aborted) return;
          await queryClient.cancelQueries({
            queryKey: nativeQueryKeys.chat.messages(threadToBackfill),
            exact: true,
          });
          if (signal.aborted) return;
          if (hintedActiveThread || recovery) {
            try {
              await markActiveThreadRead(userId, threadToBackfill);
              durableReads.push(queryClient.refetchQueries({
                queryKey: nativeQueryKeys.inbox.threads,
                exact: true,
                type: "active",
              }));
            } catch (error) {
              if (!signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) {
                console.warn("Message read receipt recovery failed", error);
              }
            }
            if (signal.aborted) return;
          }
          durableReads.push(
            fetchMessages(threadToBackfill, null, signal).then((latestPage) => {
              if (signal.aborted) return;
              queryClient.setQueryData<InfiniteData<MessagesData>>(
                nativeQueryKeys.chat.messages(threadToBackfill),
                { pages: [latestPage], pageParams: [null] },
              );
            }),
          );
        }

        const results = await Promise.allSettled(durableReads);
        if (!signal.aborted) {
          results.forEach((result) => {
            if (result.status === "rejected") {
              console.warn("Message realtime durable refresh failed", result.reason);
            }
          });
        }
      },
    });

    const friendshipConvergence = createRealtimeConvergenceBatcher({
      delayMs: FRIENDS_REFRESH_DEBOUNCE_MS,
      onError: (error) => console.warn("Friendship realtime recovery failed", error),
      onFlush: async ({ threadIds }, signal) => {
        const includeInbox = threadIds.includes(FRIENDSHIP_HINT_KEY);
        const keys = [
          nativeQueryKeys.social.friends,
          nativeQueryKeys.social.requests,
          ...(includeInbox ? [nativeQueryKeys.inbox.threads] : []),
        ];

        await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({
          queryKey,
          exact: true,
          refetchType: "none",
        })));
        if (signal.aborted) return;
        await Promise.all(keys.map((queryKey) => queryClient.refetchQueries({
          queryKey,
          exact: true,
          type: "active",
        })));
      },
    });

    const coinConvergence = createRealtimeConvergenceBatcher({
      delayMs: COINS_REFRESH_DEBOUNCE_MS,
      onError: (error) => console.warn("Coin realtime recovery failed", error),
      onFlush: async (_batch, signal) => {
        await queryClient.invalidateQueries({
          queryKey: nativeQueryKeys.coins,
          exact: true,
          refetchType: "none",
        });
        if (signal.aborted) return;
        await queryClient.refetchQueries({
          queryKey: nativeQueryKeys.coins,
          exact: true,
          type: "active",
        });
      },
    });

    const profileConvergence = createRealtimeConvergenceBatcher({
      delayMs: PROFILE_REFRESH_DEBOUNCE_MS,
      onError: (error) => console.warn("Profile realtime recovery failed", error),
      onFlush: async ({ recovery, threadIds: profileIds }, signal) => {
        const refetch = canRefreshActiveNativeQueries();
        await Promise.all(profileIds.map((profileId) =>
          refreshNativeProfileReferences(queryClient, userId, profileId, { signal, refetch })));
        if (recovery && refetch && !signal.aborted) {
          await refreshActiveNativeProfileQueries(queryClient, userId, signal);
        }
      },
    });

    const profileRecoveryScheduler = createActiveQueryRecoveryScheduler({
      intervalMs: PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
      isEligible: () => canRefreshActiveNativeQueries()
        && queryClient.getQueryCache().findAll({
          predicate: isNativeProfileRecoveryQuery,
        }).some((query) => query.getObserversCount() > 0),
      onRecover: async (signal) => {
        await refreshActiveNativeProfileQueries(queryClient, userId, signal);
      },
      onError: (error) => console.warn("Profile bounded recovery failed", error),
    });
    const stopProfileCacheObservation = queryClient.getQueryCache().subscribe(
      () => profileRecoveryScheduler.reevaluate(),
    );
    const stopProfileOnlineObservation = onlineManager.subscribe(
      () => profileRecoveryScheduler.reevaluate(),
    );
    profileRecoveryScheduler.reevaluate();

    const channel = createUserSyncChannel({
      userId,
      createChannel: (name) => supabase.channel(name, {
        config: { private: true },
      }),
      onBroadcast: (userChannel, event, handler) => {
        userChannel.on("broadcast", { event }, handler);
      },
      onMessagesChanged: (payload) => {
        const hint = parseMessageHint(payload);
        if (hint && !(hint.action === "read" && hint.actor_id === userId)) {
          convergence.hint(hint.thread_id);
        }
      },
      onFriendshipsChanged: () => friendshipConvergence.hint(FRIENDSHIP_HINT_KEY),
      onCoinsChanged: () => coinConvergence.hint("coins"),
      onProfileChanged: (payload) => {
        const hint = parseProfileHint(payload);
        if (hint) profileConvergence.hint(hint.profile_id);
      },
    });
    const subscription = channel
      .subscribe((status, error) => {
        convergence.subscriptionStatus(status as RealtimeSubscriptionStatus);
        friendshipConvergence.subscriptionStatus(status as RealtimeSubscriptionStatus);
        coinConvergence.subscriptionStatus(status as RealtimeSubscriptionStatus);
        profileConvergence.subscriptionStatus(status as RealtimeSubscriptionStatus);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("User realtime subscription failed", error);
        }
      });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      profileRecoveryScheduler.reevaluate();
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastForegroundRefresh.current < FOREGROUND_REFRESH_MS) return;
      lastForegroundRefresh.current = now;
      convergence.recover();
      friendshipConvergence.recover();
      coinConvergence.recover();
      profileConvergence.recover();
    });

    return () => {
      convergence.dispose();
      friendshipConvergence.dispose();
      coinConvergence.dispose();
      profileConvergence.dispose();
      profileRecoveryScheduler.dispose();
      stopProfileCacheObservation();
      stopProfileOnlineObservation();
      appStateSubscription.remove();
      void queryClient.cancelQueries({ queryKey: nativeQueryKeys.inbox.threads, exact: true });
      void queryClient.cancelQueries({ queryKey: nativeQueryKeys.chat.all, exact: false });
      void queryClient.cancelQueries({ queryKey: nativeQueryKeys.social.friends, exact: true });
      void queryClient.cancelQueries({ queryKey: nativeQueryKeys.social.requests, exact: true });
      void queryClient.cancelQueries({ queryKey: nativeQueryKeys.coins, exact: true });
      void queryClient.cancelQueries({ queryKey: PROFILE_CURRENT_QUERY_KEY, exact: true });
      void queryClient.cancelQueries({ predicate: isNativeProfileRecoveryQuery });
      void subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
