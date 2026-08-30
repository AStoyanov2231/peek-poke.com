"use client";

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
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";
import {
  fetchThreadMessages,
  webQueryKeys,
  type ThreadQueryData,
} from "@/data/web-query";
import {
  isWebProfileRecoveryQuery,
  refreshActiveWebProfileQueries,
  refreshWebProfileReferences,
} from "@/data/owner-profile-cache";
import { markActiveThreadRead } from "@/data/read-receipt";

const supabase = createClient();
const VISIBILITY_THROTTLE_MS = 30_000;
const REFETCH_DEBOUNCE_MS = 500;
const FRIENDS_REFETCH_DEBOUNCE_MS = 1_500;
const COINS_REFETCH_DEBOUNCE_MS = 1_500;
const PROFILE_REFETCH_DEBOUNCE_MS = 500;
const FRIENDSHIP_HINT_KEY = "friendships";

function parseMessageHint(value: unknown) {
  const payload = value && typeof value === "object"
    ? (value as { payload?: unknown }).payload
    : null;
  const parsed = messageHintSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function parseProfileHint(value: unknown) {
  const payload = value && typeof value === "object"
    ? (value as { payload?: unknown }).payload
    : null;
  const parsed = profileUpdatedHintSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function canRefreshVisibleWebQueries() {
  return document.visibilityState === "visible" && onlineManager.isOnline();
}

export function useRealtimeUserSync({
  userId,
  isPreloading,
}: {
  userId: string | undefined;
  isPreloading: boolean;
}) {
  const queryClient = useQueryClient();
  const lastVisibilityFetch = useRef(0);

  // Supabase events only schedule bounded API reads; no event payload is
  // applied directly to durable message, inbox, or friendship state.
  // Supabase's channel is unsubscribed and removed in the cleanup below; the
  // scanner cannot pair the fluent `.on()` allocation with that cleanup.
  // react-doctor-disable-next-line no-fetch-in-effect, react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (isPreloading || !userId) return;

    const convergence = createRealtimeConvergenceBatcher({
      delayMs: REFETCH_DEBOUNCE_MS,
      onError: (error) => console.error("Message realtime recovery failed", error),
      onFlush: async ({ recovery, threadIds }, signal) => {
        await queryClient.invalidateQueries({
          queryKey: webQueryKeys.threads,
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
            queryKey: webQueryKeys.messages(threadId),
            exact: true,
            type: "inactive",
          });
        }
        if (recovery) {
          queryClient.removeQueries({
            queryKey: webQueryKeys.threads,
            exact: false,
            type: "inactive",
            predicate: (query) => query.queryKey.length > webQueryKeys.threads.length,
          });
        }

        const durableReads: Promise<unknown>[] = [
          queryClient.refetchQueries({
            queryKey: webQueryKeys.threads,
            exact: true,
            type: "active",
          }),
        ];

        if (threadToBackfill) {
          await queryClient.invalidateQueries({
            queryKey: webQueryKeys.messages(threadToBackfill),
            exact: true,
            refetchType: "none",
          });
          if (signal.aborted) return;
          await queryClient.cancelQueries({
            queryKey: webQueryKeys.messages(threadToBackfill),
            exact: true,
          });
          if (signal.aborted) return;
          if (hintedActiveThread || recovery) {
            try {
              await markActiveThreadRead(userId, threadToBackfill);
              durableReads.push(queryClient.refetchQueries({
                queryKey: webQueryKeys.threads,
                exact: true,
                type: "active",
              }));
            } catch (error) {
              if (!signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) {
                console.error("Message read receipt recovery failed", error);
              }
            }
            if (signal.aborted) return;
          }
          durableReads.push(
            fetchThreadMessages(threadToBackfill, null, signal).then((latestPage) => {
              if (signal.aborted) return;
              queryClient.setQueryData<InfiniteData<ThreadQueryData>>(
                webQueryKeys.messages(threadToBackfill),
                { pages: [latestPage], pageParams: [null] },
              );
            }),
          );
        }

        const results = await Promise.allSettled(durableReads);
        if (!signal.aborted) {
          results.forEach((result) => {
            if (result.status === "rejected") {
              console.error("Message realtime durable refresh failed", result.reason);
            }
          });
        }
      },
    });

    const friendshipConvergence = createRealtimeConvergenceBatcher({
      delayMs: FRIENDS_REFETCH_DEBOUNCE_MS,
      onError: (error) => console.error("Friendship realtime recovery failed", error),
      onFlush: async (_batch, signal) => {
        await queryClient.invalidateQueries({
          queryKey: webQueryKeys.friends,
          exact: true,
          refetchType: "none",
        });
        if (signal.aborted) return;
        await queryClient.refetchQueries({
          queryKey: webQueryKeys.friends,
          exact: true,
          type: "active",
        });
      },
    });

    const coinConvergence = createRealtimeConvergenceBatcher({
      delayMs: COINS_REFETCH_DEBOUNCE_MS,
      onError: (error) => console.error("Coin realtime recovery failed", error),
      onFlush: async (_batch, signal) => {
        await queryClient.invalidateQueries({
          queryKey: webQueryKeys.coins,
          exact: true,
          refetchType: "none",
        });
        if (signal.aborted) return;
        await queryClient.refetchQueries({
          queryKey: webQueryKeys.coins,
          exact: true,
          type: "active",
        });
      },
    });

    const profileConvergence = createRealtimeConvergenceBatcher({
      delayMs: PROFILE_REFETCH_DEBOUNCE_MS,
      onError: (error) => console.error("Profile realtime recovery failed", error),
      onFlush: async ({ recovery, threadIds: profileIds }, signal) => {
        const refetch = canRefreshVisibleWebQueries();
        await Promise.all(profileIds.map((profileId) =>
          refreshWebProfileReferences(queryClient, userId, profileId, { signal, refetch })));
        if (recovery && refetch && !signal.aborted) {
          await refreshActiveWebProfileQueries(queryClient, signal);
        }
      },
    });

    const profileRecoveryScheduler = createActiveQueryRecoveryScheduler({
      intervalMs: PROFILE_REFERENCE_RECOVERY_INTERVAL_MS,
      isEligible: () => canRefreshVisibleWebQueries()
        && queryClient.getQueryCache().findAll({
          predicate: isWebProfileRecoveryQuery,
        }).some((query) => query.getObserversCount() > 0),
      onRecover: async (signal) => {
        await refreshActiveWebProfileQueries(queryClient, signal);
      },
      onError: (error) => console.error("Profile bounded recovery failed", error),
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
          console.error("User realtime subscription failed", error);
        }
      });

    const handleVisibilityChange = () => {
      profileRecoveryScheduler.reevaluate();
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilityFetch.current < VISIBILITY_THROTTLE_MS) return;
      lastVisibilityFetch.current = now;
      convergence.recover();
      friendshipConvergence.recover();
      coinConvergence.recover();
      profileConvergence.recover();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      convergence.dispose();
      friendshipConvergence.dispose();
      coinConvergence.dispose();
      profileConvergence.dispose();
      profileRecoveryScheduler.dispose();
      stopProfileCacheObservation();
      stopProfileOnlineObservation();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void queryClient.cancelQueries({
        queryKey: webQueryKeys.threads,
        exact: false,
      });
      void queryClient.cancelQueries({ queryKey: webQueryKeys.friends, exact: true });
      void queryClient.cancelQueries({ queryKey: webQueryKeys.coins, exact: true });
      void queryClient.cancelQueries({ queryKey: webQueryKeys.profile, exact: true });
      void queryClient.cancelQueries({ predicate: isWebProfileRecoveryQuery });
      void subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [isPreloading, queryClient, userId]);
}
