"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Loader2, Clock, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FriendRow } from "@/features/inbox/components/FriendRow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isPremium } from "@/types/database";
import type { FriendWithFriendshipId, FriendshipWithAddressee } from "@/stores/appStore";
import { useFriends, useSentRequests, useIsFriendsLoaded, useThreads } from "@/stores/selectors";
import { useAuth } from "@/features/auth/useAuth";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { webQueryKeys } from "@/data/web-query";
import {
  discardFriendshipRemoval,
  pendingFriendshipRemoval,
  removeFriendship,
} from "@/data/friend-mutations";
import { createOrFindThread } from "@/data/thread-mutations";

// This tab coordinates friend queries, mutations, and their UI states.
// react-doctor-disable-next-line no-giant-component
export function FriendsTab() {
  const queryClient = useQueryClient();
  const router = useTransitionRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const threads = useThreads();

  const storeFriends = useFriends();
  const storeSentRequests = useSentRequests();
  const isFriendsLoaded = useIsFriendsLoaded();

  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [friendToRemove, setFriendToRemove] = useState<FriendWithFriendshipId | null>(null);
  const [sentRequestToCancel, setSentRequestToCancel] = useState<FriendshipWithAddressee | null>(null);
  const [removalRecovery, setRemovalRecovery] = useState<
    | { kind: "unfriend"; friend: FriendWithFriendshipId }
    | { kind: "cancel"; request: FriendshipWithAddressee }
    | null
  >(null);
  const [optimisticFriends, updateOptimisticFriends] = useOptimistic(
    storeFriends,
    (state, action: { type: "remove"; friendId: string }) => {
      return state.filter((f) => f.id !== action.friendId);
    }
  );

  const [optimisticSentRequests, updateOptimisticSentRequests] = useOptimistic(
    storeSentRequests,
    (state, removedId: string) => state.filter((r) => r.id !== removedId)
  );

  const handleUnfriend = async (friend: FriendWithFriendshipId) => {
    const { friendship_id: friendshipId, id: friendId } = friend;
    if (processingIds.has(friendshipId)) return;

    setFriendToRemove(null);
    setProcessingIds((prev) => new Set(prev).add(friendshipId));

    startTransition(async () => {
      try {
        await removeFriendship(friendshipId, (response) => {
          startTransition(() => {
            updateOptimisticFriends({ type: "remove", friendId });
          });
          if (response.balance !== null) {
            queryClient.setQueryData(webQueryKeys.coins, { balance: response.balance });
          }
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: webQueryKeys.friends }),
            queryClient.invalidateQueries({ queryKey: webQueryKeys.threads }),
          ]);
        });
        setRemovalRecovery(null);
      } catch (error) {
        console.error("Failed to unfriend:", error);
        if (pendingFriendshipRemoval(friendshipId)) {
          setRemovalRecovery({ kind: "unfriend", friend });
        }
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(friendshipId);
          return next;
        });
      }
    });
  };

  const handleOpenChat = async (friendId: string) => {
    if (processingIds.has(friendId)) return;

    // Check store for existing thread — skip API call if found
    const existing = threads.find(
      (t) =>
        (t.participant_1_id === user?.id && t.participant_2_id === friendId) ||
        (t.participant_2_id === user?.id && t.participant_1_id === friendId)
    );

    if (existing) {
      if (window.innerWidth < 768) {
        router.push(`/chat/${existing.id}`);
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "chats");
        params.set("thread", existing.id);
        router.replace(`/inbox?${params.toString()}`, { scroll: false });
      }
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(friendId));
    try {
      const response = await createOrFindThread(friendId);
      queryClient.setQueryData(webQueryKeys.coins, { balance: response.balance });
      await queryClient.invalidateQueries({ queryKey: webQueryKeys.threads });
      if (window.innerWidth < 768) {
        router.push(`/chat/${response.id}`);
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "chats");
        params.set("thread", response.id);
        router.replace(`/inbox?${params.toString()}`, { scroll: false });
      }
    } catch (error) {
      console.error("Failed to open chat:", error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  };

  const handleCancelSentRequest = async (sentRequest: FriendshipWithAddressee) => {
    const { id: friendshipId } = sentRequest;
    if (processingIds.has(friendshipId)) return;

    setSentRequestToCancel(null);
    setProcessingIds((prev) => new Set(prev).add(friendshipId));

    startTransition(async () => {
      try {
        await removeFriendship(friendshipId, (response) => {
          startTransition(() => {
            updateOptimisticSentRequests(friendshipId);
          });
          if (response.balance !== null) {
            queryClient.setQueryData(webQueryKeys.coins, { balance: response.balance });
          }
          void queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
        });
        setRemovalRecovery(null);
      } catch (error) {
        console.error("Failed to cancel sent request:", error);
        if (pendingFriendshipRemoval(friendshipId)) {
          setRemovalRecovery({ kind: "cancel", request: sentRequest });
        }
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(friendshipId);
          return next;
        });
      }
    });
  };

  if (!isFriendsLoaded) {
    return (
      <div className="space-y-1 px-2 pt-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const onlineFriends = optimisticFriends.filter((friend) => friend.is_online);
  const offlineFriends = optimisticFriends.filter((friend) => !friend.is_online);

  return (
    <>
      <div className="space-y-0.5 px-2 py-2">
        {optimisticFriends.length === 0 && optimisticSentRequests.length === 0 ? (
          <p className="t-body muted text-center py-8">No friends yet</p>
        ) : (
          <>
            {onlineFriends.length > 0 && (
              <>
                <p className="t-micro muted px-3 pb-1 pt-2">Online · {onlineFriends.length}</p>
                {onlineFriends.map((friend) => {
                  const isProcessing = processingIds.has(friend.friendship_id) || processingIds.has(friend.id);
                  return (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      isOnline={true}
                      isProcessing={isProcessing}
                      onSwipeComplete={() => setFriendToRemove(friend)}
                      onClickProfile={() => router.push(`/profile/${friend.id}`)}
                      onOpenChat={() => handleOpenChat(friend.id)}
                    />
                  );
                })}
              </>
            )}

            {offlineFriends.length > 0 && (
              <>
                <p className="t-micro muted px-3 pb-1 pt-2">{optimisticFriends.length} friends</p>
                {offlineFriends.map((friend) => {
                  const isProcessing = processingIds.has(friend.friendship_id) || processingIds.has(friend.id);
                  return (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      isOnline={false}
                      isProcessing={isProcessing}
                      onSwipeComplete={() => setFriendToRemove(friend)}
                      onClickProfile={() => router.push(`/profile/${friend.id}`)}
                      onOpenChat={() => handleOpenChat(friend.id)}
                    />
                  );
                })}
              </>
            )}

            {/* Sent requests section */}
            {optimisticSentRequests.length > 0 && (
              <>
                <p className="t-micro muted px-3 pb-1 pt-4">Pending</p>
                {optimisticSentRequests.map((req) => {
                  const isProcessing = processingIds.has(req.id);
                  const name = req.addressee.display_name || req.addressee.username;
                  return (
                    <div key={req.id} className="flex items-center gap-3 px-3 py-3 rounded-xl md:hover:bg-ink-1">
                      <Avatar className="h-11 w-11 flex-shrink-0">
                        <AvatarImage src={req.addressee.avatar_url || undefined} alt={name} />
                        <AvatarFallback name={name} />
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button type="button"
                            onClick={() => router.push(`/profile/${req.addressee.id}`)}
                            className="t-body-b text-ink-9 truncate hover:underline"
                          >
                            {name}
                          </button>
                          {isPremium(req.addressee) && <PremiumBadge size="sm" />}
                        </div>
                        <p className="t-caption muted flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </p>
                      </div>
                      <button type="button"
                        aria-label="Cancel sent request"
                        onClick={() => setSentRequestToCancel(req)}
                        disabled={isProcessing}
                        className="iconbtn disabled:opacity-50"
                        style={{ width: 36, height: 36 }}
                      >
                        {isProcessing
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <X className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Unfriend confirmation */}
      <AlertDialog open={!!friendToRemove} onOpenChange={(open) => !open && setFriendToRemove(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove friend?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {friendToRemove?.display_name || friendToRemove?.username}
              </span>{" "}
              from your friends? You can always add them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => friendToRemove && handleUnfriend(friendToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel sent request confirmation */}
      <AlertDialog open={!!sentRequestToCancel} onOpenChange={(open) => !open && setSentRequestToCancel(null)}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel friend request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your friend request to{" "}
              <span className="font-semibold text-foreground">
                {sentRequestToCancel?.addressee.display_name || sentRequestToCancel?.addressee.username}
              </span>
              ? You can send a new request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sentRequestToCancel && handleCancelSentRequest(sentRequestToCancel)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removalRecovery} onOpenChange={() => undefined}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-lg rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Removal status unknown</AlertDialogTitle>
            <AlertDialogDescription>
              The server may already have completed this action. Retry to recover its exact result,
              or discard the saved attempt and refresh before trying a different action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const friendshipId = removalRecovery?.kind === "unfriend"
                  ? removalRecovery.friend.friendship_id
                  : removalRecovery?.request.id;
                if (friendshipId) discardFriendshipRemoval(friendshipId);
                setRemovalRecovery(null);
                void queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
              }}
            >
              Discard and refresh
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const recovery = removalRecovery;
                setRemovalRecovery(null);
                if (recovery?.kind === "unfriend") void handleUnfriend(recovery.friend);
                if (recovery?.kind === "cancel") void handleCancelSentRequest(recovery.request);
              }}
            >
              Retry exact attempt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
