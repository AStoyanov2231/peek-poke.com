"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { UpgradeDialog } from "@/components/ui/UpgradeDialog";
import { isPremium } from "@/types/database";
import { useFriendRequests } from "@/stores/selectors";
import { webQueryKeys } from "@/data/web-query";
import { respondToFriendRequest } from "@/data/friend-mutations";
import { ApiTransportError } from "@peekpoke/shared";

export function RequestsTab() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const storeRequests = useFriendRequests();

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

    startTransition(async () => {
      try {
        await respondToFriendRequest(id, status, () => {
          updateOptimisticRequests(id);
          void queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
        });
      } catch (error) {
        if (error instanceof ApiTransportError &&
          (error.code === "FRIEND_LIMIT_REACHED" || error.code === "REQUESTER_LIMIT_REACHED")) {
          setUpgradeMessage(error.message);
          setShowUpgradeDialog(true);
        }
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

  const hasContent = optimisticRequests.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
        <p className="t-body muted">No pending requests</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0.5 px-2 py-2">
        <p className="t-micro muted px-3 pb-1 pt-2">Incoming</p>
        {optimisticRequests.map((req) => {
              const name = req.requester.display_name || req.requester.username;
              return (
                <div key={req.id} className="flex items-center gap-3 px-3 py-3 rounded-xl md:hover:bg-ink-1">
                  <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarImage
                      src={req.requester.avatar_url || undefined}
                      alt={name}
                    />
                    <AvatarFallback name={name} />
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <button type="button"
                        onClick={() => router.push(`/profile/${req.requester.id}`)}
                        className="t-body-b text-ink-9 truncate hover:underline"
                      >
                        {name}
                      </button>
                      {isPremium(req.requester) && <PremiumBadge size="sm" />}
                    </div>
                    <p className="t-caption muted">@{req.requester.username}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button type="button"
                      onClick={() => handleRequest(req.id, "declined")}
                      disabled={processingIds.has(req.id)}
                      className="btn btn-ghost btn-sm disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button type="button"
                      onClick={() => handleRequest(req.id, "accepted")}
                      disabled={processingIds.has(req.id)}
                      className="btn btn-accent btn-sm disabled:opacity-50"
                    >
                      {processingIds.has(req.id)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : "Accept"}
                    </button>
                  </div>
                </div>
              );
        })}
      </div>

      <UpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} message={upgradeMessage} />
    </>
  );
}
