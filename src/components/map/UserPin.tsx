"use client";

import { memo } from "react";
import type { NearbyUser } from "@/types/database";

interface UserPinContentProps {
  user: NearbyUser;
  isSelf?: boolean;
  isFriend?: boolean;
  isHighlighted?: boolean;
}

export const UserPinContent = memo(function UserPinContent({ user, isSelf, isFriend, isHighlighted }: UserPinContentProps) {
  const initial = (user.display_name || user.username || "?").slice(0, 1).toUpperCase();
  const avatarClass = isSelf
    ? "user-pin-avatar user-pin-avatar-self"
    : isHighlighted
      ? "user-pin-avatar user-pin-avatar-highlighted"
      : isFriend
        ? "user-pin-avatar user-pin-avatar-friend"
        : "user-pin-avatar";

  return (
    <div className="user-pin cursor-pointer">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" loading="lazy" decoding="async" className={avatarClass} />
      ) : (
        <div className={`${avatarClass} user-pin-avatar-fallback`}>{initial}</div>
      )}
    </div>
  );
});
