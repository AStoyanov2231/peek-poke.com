"use client";

import { Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { SwipeableFriendCard } from "@/features/friends/components/SwipeableFriendCard";
import { isPremium } from "@/types/database";
import type { FriendWithFriendshipId } from "@/stores/appStore";

interface FriendRowProps {
  friend: FriendWithFriendshipId;
  isOnline: boolean;
  isProcessing: boolean;
  onSwipeComplete: () => void;
  onClickProfile: () => void;
  onOpenChat: () => void;
}

export function FriendRow({
  friend,
  isOnline,
  isProcessing,
  onSwipeComplete,
  onClickProfile,
  onOpenChat,
}: FriendRowProps) {
  const name = friend.display_name || friend.username;

  return (
    <div className="rounded-xl transition-all active:scale-[0.98]">
      <SwipeableFriendCard onSwipeComplete={onSwipeComplete} disabled={isProcessing}>
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl select-none md:hover:bg-ink-1">
          <button type="button" className="relative flex-shrink-0" aria-label={`View ${name}'s profile`} onClick={(e) => { e.stopPropagation(); onClickProfile(); }}>
            <Avatar className="h-11 w-11">
              <AvatarImage src={friend.avatar_url || undefined} alt={name} />
              <AvatarFallback name={name} />
            </Avatar>
            {isOnline && (
              <span className="absolute bottom-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-surface" />
            )}
          </button>
          <button type="button" className="flex-1 min-w-0 text-left" onClick={onOpenChat}>
            <div className="flex items-center gap-1.5">
              <p className="t-body-b text-ink-9 truncate">{name}</p>
              {isPremium(friend) && <PremiumBadge size="sm" />}
            </div>
            <p className="t-caption">
              {isOnline
                ? <span className="text-success-600 font-medium">Online</span>
                : <span className="muted">@{friend.username}</span>}
            </p>
          </button>
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin text-ink-5 flex-shrink-0" />
          ) : (
            <button type="button"
              className="btn btn-secondary btn-sm flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
            >
              Message
            </button>
          )}
        </div>
      </SwipeableFriendCard>
    </div>
  );
}
