"use client";

import { ChevronLeft, User, Video } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { isPremium, type ProfileCard } from "@peekpoke/shared";

interface ChatHeaderProps {
  other: ProfileCard;
  isOnline: boolean;
  isTyping?: boolean;
  distanceMeters: number | null;
  onBack: () => void;
  onStartCall?: () => void;
}

export function ChatHeader({ other, isOnline, isTyping = false, distanceMeters, onBack, onStartCall }: ChatHeaderProps) {
  const name = other.display_name || other.username;

  const subtitle = other.account_deleted
    ? "Account deleted"
    : isTyping
    ? "Typing…"
    : isOnline
    ? distanceMeters !== null
      ? `Online · ${distanceMeters}m away`
      : "Online now"
    : `@${other.username}`;

  return (
    <div
      className="flex items-center gap-3 px-4 flex-shrink-0 border-b border-hairline bg-surface"
      style={{ paddingTop: "calc(var(--safe-area-top) + 12px)", paddingBottom: 12 }}
    >
      <button type="button" onClick={onBack} className="iconbtn md:hidden" style={{ width: 36, height: 36 }} aria-label="Back">
        <ChevronLeft size={22} />
      </button>

      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={other.avatar_url || undefined} alt={name} />
          <AvatarFallback name={name} />
        </Avatar>
        {isOnline && (
          <span className="absolute bottom-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-success-500 ring-2 ring-surface" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="t-body-b text-ink-9 truncate">{name}</span>
          {isPremium(other) && <PremiumBadge size="sm" />}
        </div>
        <p className={`t-caption ${isOnline || isTyping ? "text-success-600" : "muted"}`}>{subtitle}</p>
      </div>

      {/* Video call button — shown on all screen sizes */}
      {onStartCall && !other.account_deleted && (
        <button type="button"
          onClick={onStartCall}
          aria-label="Start video call"
          className="iconbtn flex-shrink-0"
          style={{ width: 36, height: 36 }}
        >
          <Video size={18} />
        </button>
      )}

      {!other.account_deleted && <div className="hidden md:flex items-center gap-2 flex-shrink-0">
        <a
          href={`/profile/${other.id}`}
          className="btn btn-secondary btn-sm"
          style={{ borderRadius: 10 }}
        >
          <User size={14} strokeWidth={2} /> Profile
        </a>
      </div>}
    </div>
  );
}
