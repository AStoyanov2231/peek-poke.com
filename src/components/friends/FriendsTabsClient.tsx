"use client";

import { useState, useOptimistic, useTransition, useEffect } from "react";
import { Check, X, Loader2, Clock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PremiumBadge } from "@/components/ui/premium-badge";
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
import { UpgradeDialog } from "@/components/ui/UpgradeDialog";
import { getInitials } from "@/lib/utils";
import { isPremium, type Profile, type Friendship } from "@/types/database";
import { useAppStore, type FriendWithFriendshipId, type FriendshipWithAddressee } from "@/stores/appStore";
import { useFriends, useFriendRequests, useSentRequests, useIsFriendsLoaded, useOnlineUsers } from "@/stores/selectors";
import { SwipeableFriendCard } from "./SwipeableFriendCard";
import { useRouter } from "next/navigation";

// Delay before clearing pending deletion flag to allow realtime events to settle
const PENDING_DELETION_CLEAR_DELAY_MS = 3000;

interface FriendsTabsClientProps {
  initialFriends: FriendWithFriendshipId[];
  initialRequests: (Friendship & { requester: Profile })[];
  initialSentRequests?: FriendshipWithAddressee[];
}

export function FriendsTabsClient({ initialFriends, initialRequests, initialSentRequests = [] }: FriendsTabsClientProps) {
  const router = useRouter();

  // Get store data and actions
  const storeFriends = useFriends();
  const storeRequests = useFriendRequests();
  const storeSentRequests = useSentRequests();
  const isFriendsLoaded = useIsFriendsLoaded();
  const onlineUsers = useOnlineUsers();
  const setFriends = useAppStore((s) => s.setFriends);
  const setRequests = useAppStore((s) => s.setRequests);
  const setSentRequests = useAppStore((s) => s.setSentRequests);
  const addFriend = useAppStore((s) => s.addFriend);
  const removeFriend = useAppStore((s) => s.removeFriend);
  const removeRequest = useAppStore((s) => s.removeRequest);
  const removeSentRequest = useAppStore((s) => s.removeSentRequest);
  const setCoins = useAppStore((s) => s.setCoins);
  const markFriendDeletionPending = useAppStore((s) => s.markFriendDeletionPending);
  const clearFriendDeletionPending = useAppStore((s) => s.clearFriendDeletionPending);

  // Use store data if loaded, otherwise fall back to SSR props
  const friends = isFriendsLoaded ? storeFriends : initialFriends;
  const requests = isFriendsLoaded ? storeRequests : initialRequests;
  const sentRequests = isFriendsLoaded ? storeSentRequests : initialSentRequests;

  // Sync SSR data to store on mount if store is empty
  useEffect(() => {
    if (!isFriendsLoaded && initialFriends.length > 0) {
      setFriends(initialFriends);
    }
    if (!isFriendsLoaded && initialRequests.length > 0) {
      setRequests(initialRequests);
    }
    if (!isFriendsLoaded && initialSentRequests.length > 0) {
      setSentRequests(initialSentRequests);
    }
  }, [isFriendsLoaded, initialFriends, initialRequests, initialSentRequests, setFriends, setRequests, setSentRequests]);

  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // State for unfriend confirmation dialog
  const [friendToRemove, setFriendToRemove] = useState<FriendWithFriendshipId | null>(null);

  // State for cancel sent request confirmation dialog
  const [sentRequestToCancel, setSentRequestToCancel] = useState<FriendshipWithAddressee | null>(null);

  // State for upgrade dialog
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  // Optimistic updates for instant feedback on accept/reject
  const [optimisticRequests, updateOptimisticRequests] = useOptimistic(
    requests,
    (state, removedId: string) => state.filter((r) => r.id !== removedId)
  );

  const [optimisticSentRequests, updateOptimisticSentRequests] = useOptimistic(
    sentRequests,
    (state, removedId: string) => state.filter((r) => r.id !== removedId)
  );

  const [optimisticFriends, updateOptimisticFriends] = useOptimistic(
    friends,
    (state, action: { type: "add"; friend: FriendWithFriendshipId } | { type: "remove"; friendId: string }) => {
      if (action.type === "add") {
        return [...state, action.friend];
      } else {
        return state.filter((f) => f.id !== action.friendId);
      }
    }
  );

  const handleRequest = async (id: string, status: "accepted" | "declined") => {
    // Prevent double-click
    if (processingIds.has(id)) return;

    const req = requests.find((r) => r.id === id);
    if (!req) return;

    // Mark as processing
    setProcessingIds((prev) => new Set(prev).add(id));

    const newFriend: FriendWithFriendshipId = { ...req.requester, friendship_id: id };

    startTransition(async () => {
      // Optimistic updates must be inside startTransition in React 19
      updateOptimisticRequests(id);
      if (status === "accepted") {
        updateOptimisticFriends({ type: "add", friend: newFriend });
      }

      try {
        const res = await fetch(`/api/friends/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });

        if (!res.ok) {
          if (res.status === 403) {
            const data = await res.json();
            if (data.error === "FRIEND_LIMIT_REACHED" || data.error === "REQUESTER_LIMIT_REACHED") {
              setUpgradeMessage(data.message);
              setShowUpgradeDialog(true);
            }
          }
          throw new Error("Failed to update friendship");
        }

        // Update store on success
        removeRequest(id);
        if (status === "accepted") {
          addFriend(newFriend);
        }
      } catch (error) {
        // Optimistic state will revert since we didn't update backing state
        console.error("Failed to handle friend request:", error);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  };

  const handleUnfriend = async (friend: FriendWithFriendshipId) => {
    const { friendship_id: friendshipId, id: friendId } = friend;

    // Prevent double-click
    if (processingIds.has(friendshipId)) return;

    // Close the dialog
    setFriendToRemove(null);

    // Mark as processing
    setProcessingIds((prev) => new Set(prev).add(friendshipId));

    // Mark as pending deletion to prevent realtime refetch from restoring the friend
    markFriendDeletionPending(friendId);

    startTransition(async () => {
      updateOptimisticFriends({ type: "remove", friendId });

      try {
        const res = await fetch(`/api/friends/${friendshipId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error("Failed to unfriend");
        }

        // Update store on success
        removeFriend(friendId);

        // Also remove the DM thread with this friend immediately
        const { threads, removeThread } = useAppStore.getState();
        const threadToRemove = threads.find((t) =>
          t.participant_1_id === friendId || t.participant_2_id === friendId
        );
        if (threadToRemove) {
          removeThread(threadToRemove.id);
        }

        // Clear pending after a delay to ensure realtime events have settled
        setTimeout(() => clearFriendDeletionPending(friendId), PENDING_DELETION_CLEAR_DELAY_MS);
      } catch (error) {
        console.error("Failed to unfriend:", error);
        // Clear pending on error so user can retry
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

  // Navigate directly to DM thread with this friend
  const handleOpenChat = async (friendId: string) => {
    if (processingIds.has(friendId)) return;
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
        router.push(`/chat/${data.thread_id}`);
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
        const res = await fetch(`/api/friends/${friendshipId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error("Failed to cancel request");
        }

        const result = await res.json();
        if (result.refunded && result.balance !== undefined && result.balance !== null) {
          setCoins(result.balance);
        }
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

  return (
    // === Section: Tab Shell ===
    <Tabs defaultValue="friends" className="w-full">
      <TabsList className="mb-6 w-full bg-transparent p-0 h-auto border-b border-border rounded-none">
        <TabsTrigger
          value="friends"
          className="flex-1 py-3 rounded-none text-[15px] font-semibold text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          All Friends ({optimisticFriends.length})
        </TabsTrigger>
        <TabsTrigger
          value="requests"
          className="flex-1 py-3 rounded-none text-[15px] font-semibold text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <span className="flex items-center gap-2">
            Requests
            {optimisticRequests.length > 0 && (
              <span className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-semibold bg-primary text-white">
                {optimisticRequests.length > 9 ? "9+" : optimisticRequests.length}
              </span>
            )}
          </span>
        </TabsTrigger>
      </TabsList>

      {/* === Section: Friend List === */}
      <TabsContent value="friends">
        <div className="space-y-4">
          {optimisticFriends.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No friends yet</p>
          ) : (
            optimisticFriends.map((friend) => {
              const isOnline = onlineUsers.has(friend.id);
              const isProcessing = processingIds.has(friend.friendship_id) || processingIds.has(friend.id);
              return (
                <SwipeableFriendCard
                  key={friend.id}
                  onSwipeComplete={() => setFriendToRemove(friend)}
                  disabled={isProcessing}
                >
                  <div className="flex items-center gap-3 p-3 bg-background shadow-neu-raised rounded-md cursor-pointer select-none">
                    <div className="relative flex-shrink-0" onClick={(e) => { e.stopPropagation(); router.push(`/profile/${friend.id}`); }}>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={friend.avatar_url || undefined} alt={friend.display_name || friend.username} />
                        <AvatarFallback className="bg-primary text-white">
                          {getInitials(friend.display_name || friend.username)}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-success rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => handleOpenChat(friend.id)}>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-[15px] text-foreground truncate">{friend.display_name || friend.username}</p>
                        {isPremium(friend) && <PremiumBadge size="sm" />}
                      </div>
                      <p className="text-[13px]">
                        {isOnline ? <span className="text-success font-medium">Online</span> : <span className="text-muted-foreground">@{friend.username}</span>}
                      </p>
                    </div>
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenChat(friend.id); }}
                        className="w-10 h-10 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center flex-shrink-0"
                      >
                        <MessageCircle className="h-[18px] w-[18px] text-primary" />
                      </button>
                    )}
                  </div>
                </SwipeableFriendCard>
              );
            })
          )}
        </div>

        {/* Unfriend confirmation dialog */}
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
      </TabsContent>

      {/* === Section: Pending Requests === */}
      <TabsContent value="requests">
        <div className="space-y-4">
          {optimisticRequests.length === 0 && optimisticSentRequests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pending requests</p>
          ) : (
            <>
              {optimisticRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-3 p-3 bg-background shadow-neu-raised rounded-md">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarImage src={req.requester.avatar_url || undefined} alt={req.requester.display_name || req.requester.username} />
                    <AvatarFallback className="bg-primary text-white">
                      {getInitials(req.requester.display_name || req.requester.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => router.push(`/profile/${req.requester.id}`)} className="font-semibold text-[15px] text-foreground truncate hover:underline">
                        {req.requester.display_name || req.requester.username}
                      </button>
                      {isPremium(req.requester) && <PremiumBadge size="sm" />}
                    </div>
                    <p className="text-[13px] text-muted-foreground">@{req.requester.username}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      aria-label="Accept friend request"
                      onClick={() => handleRequest(req.id, "accepted")}
                      disabled={processingIds.has(req.id)}
                      className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50"
                    >
                      {processingIds.has(req.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      aria-label="Reject friend request"
                      onClick={() => handleRequest(req.id, "declined")}
                      disabled={processingIds.has(req.id)}
                      className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm text-muted-foreground flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* === Section: Sent Requests === */}
              {optimisticSentRequests.length > 0 && (
                <>
                  {optimisticRequests.length > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sent</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {optimisticSentRequests.map((req) => (
                    <div key={req.id} className="flex items-center gap-3 p-3 bg-background shadow-neu-raised rounded-md">
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarImage src={req.addressee.avatar_url || undefined} alt={req.addressee.display_name || req.addressee.username} />
                        <AvatarFallback className="bg-primary text-white/70">
                          {getInitials(req.addressee.display_name || req.addressee.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => router.push(`/profile/${req.addressee.id}`)} className="font-semibold text-[15px] text-foreground truncate hover:underline">
                            {req.addressee.display_name || req.addressee.username}
                          </button>
                          {isPremium(req.addressee) && <PremiumBadge size="sm" />}
                        </div>
                        <p className="text-[13px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </p>
                      </div>
                      <button
                        aria-label="Cancel sent request"
                        onClick={() => setSentRequestToCancel(req)}
                        disabled={processingIds.has(req.id)}
                        className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm text-muted-foreground flex items-center justify-center disabled:opacity-50"
                      >
                        {processingIds.has(req.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Cancel sent request confirmation dialog */}
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
      </TabsContent>

      <UpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} message={upgradeMessage} />
    </Tabs>
  );
}
