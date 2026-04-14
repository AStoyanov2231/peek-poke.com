"use client";

import type { NearbyUser } from "@/types/database";

interface UserPinContentProps {
  user: NearbyUser;
  isSelf?: boolean;
  isFriend?: boolean;
}

export function UserPinContent({ user, isSelf, isFriend }: UserPinContentProps) {
  const initial = (user.display_name || user.username || "?").slice(0, 1).toUpperCase();
  const avatarClass = isSelf
    ? "user-pin-avatar user-pin-avatar-self"
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
}
