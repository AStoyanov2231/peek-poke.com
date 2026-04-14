"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { UpgradeDialog } from "@/components/ui/UpgradeDialog";
import { getInitials } from "@/lib/utils";
import { isPremium } from "@/types/database";
import { useAppStore, type FriendWithFriendshipId } from "@/stores/appStore";
import { useFriendRequests } from "@/stores/selectors";

export function RequestsTab() {
  const router = useRouter();
  const storeRequests = useFriendRequests();
  const addFriend = useAppStore((s) => s.addFriend);
  const removeRequest = useAppStore((s) => s.removeRequest);

  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  const [optimisticRequests, updateOptimisticRequests] = useOptimistic(
    storeRequests,
    (state, removedId: string) => state.filter((r) => r.id !== removedId)
  );

  const handleRequest = async (id: string, status: "accepted" | "declined") => {
    if (processingIds.has(id)) return;

    const req = storeRequests.find((r) => r.id === id);
    if (!req) return;

    setProcessingIds((prev) => new Set(prev).add(id));

    const newFriend: FriendWithFriendshipId = { ...req.requester, friendship_id: id };

    startTransition(async () => {
      updateOptimisticRequests(id);

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

        removeRequest(id);
        if (status === "accepted") {
          addFriend(newFriend);
        }
      } catch (error) {
        // Optimistic state reverts automatically since backing state wasn't updated
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

  if (optimisticRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="text-muted-foreground text-sm">No pending requests</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 p-3">
        {optimisticRequests.map((req) => (
          <div key={req.id} className="flex items-center gap-3 p-3 bg-background rounded-xl transition-all md:hover:shadow-neu-inset">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage
                src={req.requester.avatar_url || undefined}
                alt={req.requester.display_name || req.requester.username}
              />
              <AvatarFallback className="bg-primary text-white">
                {getInitials(req.requester.display_name || req.requester.username)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => router.push(`/profile/${req.requester.id}`)}
                  className="font-semibold text-[15px] text-foreground truncate hover:underline"
                >
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
                className="w-9 h-9 rounded-full bg-primary text-white shadow-neu-raised-sm flex items-center justify-center disabled:opacity-50"
              >
                {processingIds.has(req.id)
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" />}
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
      </div>

      <UpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} message={upgradeMessage} />
    </>
  );
}
