"use client";

import { memo } from "react";
import Image from "next/image";
import type { Availability } from "@peekpoke/shared";
import type { NearbyUser } from "@/types/database";
import { activityInfo } from "@/features/now/activities";

interface UserPinContentProps {
  user: NearbyUser;
  isSelf?: boolean;
  isFriend?: boolean;
  isHighlighted?: boolean;
  availability?: Availability;
}

export const UserPinContent = memo(function UserPinContent({ user, isSelf, isFriend, isHighlighted, availability }: UserPinContentProps) {
  const initial = (user.display_name || user.username || "?").slice(0, 1).toUpperCase();
  const activity = availability ? activityInfo(availability.activity) : null;
  const ActivityIcon = activity?.Icon;
  const avatarClass = isSelf
    ? "user-pin-avatar user-pin-avatar-self"
    : isHighlighted
      ? "user-pin-avatar user-pin-avatar-highlighted"
      : isFriend
        ? "user-pin-avatar user-pin-avatar-friend"
        : "user-pin-avatar";

  return (
    <div className={`user-pin cursor-pointer${availability ? " user-pin-available" : ""}`}>
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt="" width={64} height={64} className={avatarClass} />
      ) : (
        <div className={`${avatarClass} user-pin-avatar-fallback`}>{initial}</div>
      )}
      {ActivityIcon ? <span className="user-pin-activity" aria-hidden="true"><ActivityIcon size={13} strokeWidth={2.25} /></span> : null}
    </div>
  );
});
