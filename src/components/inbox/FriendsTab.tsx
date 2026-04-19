"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Clock, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FriendRow } from "@/components/inbox/FriendRow";
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
import { getInitials } from "@/lib/utils";
import { isPremium } from "@/types/database";
import { useAppStore, type FriendWithFriendshipId, type FriendshipWithAddressee } from "@/stores/appStore";
import { useFriends, useSentRequests, useIsFriendsLoaded, useOnlineUsers, useThreads } from "@/stores/selectors";
import { useAuth } from "@/hooks/useAuth";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";

const PENDING_DELETION_CLEAR_DELAY_MS = 3000;

export function FriendsTab() {
  const router = useTransitionRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const threads = useThreads();

  const storeFriends = useFriends();
  const storeSentRequests = useSentRequests();
  const isFriendsLoaded = useIsFriendsLoaded();
  const onlineUsers = useOnlineUsers();
  const removeFriend = useAppStore((s) => s.removeFriend);
  const removeSentRequest = useAppStore((s) => s.removeSentRequest);
  const markFriendDeletionPending = useAppStore((s) => s.markFriendDeletionPending);
  const clearFriendDeletionPending = useAppStore((s) => s.clearFriendDeletionPending);

  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [friendToRemove, setFriendToRemove] = useState<FriendWithFriendshipId | null>(null);
  const [sentRequestToCancel, setSentRequestToCancel] = useState<FriendshipWithAddressee | null>(null);
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
    markFriendDeletionPending(friendId);

    startTransition(async () => {
      updateOptimisticFriends({ type: "remove", friendId });

      try {
        const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to unfriend");

        removeFriend(friendId);

        const { threads, removeThread } = useAppStore.getState();
        const threadToRemove = threads.find(
          (t) => t.participant_1_id === friendId || t.participant_2_id === friendId
        );
        if (threadToRemove) removeThread(threadToRemove.id);

        setTimeout(() => clearFriendDeletionPending(friendId), PENDING_DELETION_CLEAR_DELAY_MS);
      } catch (error) {
        console.error("Failed to unfriend:", error);
        clearFriendDeletionPending(friendId);
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
      const res = await fetch("/api/dm/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: friendId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open chat");
      if (data.thread_id) {
        if (window.innerWidth < 768) {
          router.push(`/chat/${data.thread_id}`);
        } else {
          const params = new URLSearchParams(searchParams.toString());
          params.set("tab", "chats");
          params.set("thread", data.thread_id);
          router.replace(`/inbox?${params.toString()}`, { scroll: false });
        }
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
      updateOptimisticSentRequests(friendshipId);

      try {
        const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to cancel request");
        removeSentRequest(friendshipId);
      } catch (error) {
        console.error("Failed to cancel sent request:", error);
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
      <div className="space-y-4 p-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 p-3">
        {optimisticFriends.length === 0 && optimisticSentRequests.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No friends yet</p>
        ) : (
          <>
            {optimisticFriends.map((friend) => {
              const isOnline = onlineUsers.has(friend.id);
              const isProcessing = processingIds.has(friend.friendship_id) || processingIds.has(friend.id);
              return (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  isOnline={isOnline}
                  isProcessing={isProcessing}
                  onSwipeComplete={() => setFriendToRemove(friend)}
                  onClickProfile={() => router.push(`/profile/${friend.id}`)}
                  onOpenChat={() => handleOpenChat(friend.id)}
                />
              );
            })}

            {/* Sent requests section */}
            {optimisticSentRequests.length > 0 && (
              <>
                <div className="px-1 py-2 border-t border-border mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending</p>
                </div>
                {optimisticSentRequests.map((req) => {
                  const isProcessing = processingIds.has(req.id);
                  return (
                    <div key={req.id} className="flex items-center gap-3 p-3 bg-background rounded-xl transition-all md:hover:shadow-neu-inset">
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarImage src={req.addressee.avatar_url || undefined} alt={req.addressee.display_name || req.addressee.username} />
                        <AvatarFallback className="bg-primary-gradient text-white/70">
                          {getInitials(req.addressee.display_name || req.addressee.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => router.push(`/profile/${req.addressee.id}`)}
                            className="font-semibold text-[15px] text-foreground truncate hover:underline"
                          >
                            {req.addressee.display_name || req.addressee.username}
                          </button>
                          {isPremium(req.addressee) && <PremiumBadge size="sm" />}
                        </div>
                        <p className="text-[13px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-background shadow-neu-raised-sm text-amber-500">
                        Sent
                      </span>
                      <button
                        aria-label="Cancel sent request"
                        onClick={() => setSentRequestToCancel(req)}
                        disabled={isProcessing}
                        className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm text-muted-foreground flex items-center justify-center disabled:opacity-50"
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

    </>
  );
}
