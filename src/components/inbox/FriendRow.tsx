"use client";

import { Loader2, MessageCircle } from "lucide-react";
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
    <div className="bg-background rounded-xl">
      <SwipeableFriendCard onSwipeComplete={onSwipeComplete} disabled={isProcessing}>
        <div className="flex items-center gap-3 p-3 bg-background rounded-xl cursor-pointer select-none transition-all md:hover:shadow-neu-inset">
          <div className="relative flex-shrink-0" onClick={(e) => { e.stopPropagation(); onClickProfile(); }}>
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
          <div className="flex-1 min-w-0" onClick={onOpenChat}>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-[15px] text-foreground truncate">
                {friend.display_name || friend.username}
              </p>
              {isPremium(friend) && <PremiumBadge size="sm" />}
            </div>
            <p className="text-[13px]">
              {isOnline
                ? <span className="text-success font-medium">Online</span>
                : <span className="text-muted-foreground">@{friend.username}</span>}
            </p>
          </div>
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
              className="w-10 h-10 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center flex-shrink-0"
            >
              <MessageCircle className="h-[18px] w-[18px] text-primary" />
            </button>
          )}
        </div>
      </SwipeableFriendCard>
    </div>
  );
}
