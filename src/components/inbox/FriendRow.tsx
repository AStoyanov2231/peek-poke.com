"use client";

import { Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { SwipeableFriendCard } from "@/components/friends/SwipeableFriendCard";
import { getInitials } from "@/lib/utils";
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
  return (
    <div className="bg-background rounded-xl transition-all md:hover:scale-[1.02] md:hover:-translate-y-0.5 active:scale-[0.98]">
      <SwipeableFriendCard onSwipeComplete={onSwipeComplete} disabled={isProcessing}>
        <div className="flex items-center gap-3 px-2 py-3 bg-background rounded-xl cursor-pointer select-none transition-all md:hover:shadow-neu-inset border border-primary/20" onClick={onOpenChat}>
          <div className="relative flex-shrink-0" onClick={(e) => { e.stopPropagation(); onClickProfile(); }}>
            <Avatar className="h-[52px] w-[52px]">
              <AvatarImage src={friend.avatar_url || undefined} alt={friend.display_name || friend.username} />
              <AvatarFallback className="bg-primary text-white">
                {getInitials(friend.display_name || friend.username)}
              </AvatarFallback>
            </Avatar>
            {isOnline && (
              <div className="absolute bottom-0 right-0 h-3 w-3 bg-success rounded-full border-2 border-background" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-[16px] text-foreground truncate">
                {friend.display_name || friend.username}
              </p>
              {isPremium(friend) && <PremiumBadge size="sm" />}
            </div>
            <p className="text-[14px]">
              {isOnline
                ? <span className="text-success font-medium">Online</span>
                : <span className="text-muted-foreground">@{friend.username}</span>}
            </p>
          </div>
          {isProcessing && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </SwipeableFriendCard>
    </div>
  );
}
