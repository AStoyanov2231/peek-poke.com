"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { isPremium, type Profile } from "@/types/database";

interface ProfileIdentityProps {
  profile: Profile;
  avatarSizeMobile?: number;
  avatarSizeDesktop?: number;
  actions?: React.ReactNode;
}

export function ProfileIdentity({
  profile,
  avatarSizeMobile = 96,
  avatarSizeDesktop = 128,
  actions,
}: ProfileIdentityProps) {
  const name = profile.display_name || profile.username;
  const joinedYear = new Date(profile.created_at).getFullYear();

  const metaText = [
    `@${profile.username}`,
    profile.location_text,
    `Joined ${joinedYear}`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {/* ── MOBILE: left-aligned with actions top-right ── */}
      <div className="md:hidden flex flex-col gap-2 px-6 -mt-12">
        <div className="flex items-end">
          <div
            className="rounded-full ring-4 ring-surface overflow-hidden flex-shrink-0"
            style={{ width: avatarSizeMobile, height: avatarSizeMobile }}
          >
            <Avatar className="w-full h-full">
              <AvatarImage src={profile.avatar_url || undefined} alt={name} />
              <AvatarFallback name={name} className="text-3xl" />
            </Avatar>
          </div>
          <div className="flex-1" />
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="t-title-1 text-ink-9">{name}</h1>
          {isPremium(profile) && <PremiumBadge showText />}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="t-caption muted">@{profile.username}</span>
          {profile.location_text && (
            <>
              <span className="t-caption muted">·</span>
              <span className="t-caption muted">{profile.location_text}</span>
            </>
          )}
          <span className="t-caption muted">·</span>
          <span className="t-caption muted">Joined {joinedYear}</span>
        </div>
      </div>

      {/* ── DESKTOP: horizontal row ── */}
      <div className="hidden md:flex items-end gap-6 px-10 -mt-14">
        <div
          className="flex-shrink-0 rounded-full overflow-hidden"
          style={{ width: avatarSizeDesktop, height: avatarSizeDesktop, padding: 5, background: "var(--ink-1)" }}
        >
          <Avatar className="w-full h-full">
            <AvatarImage src={profile.avatar_url || undefined} alt={name} />
            <AvatarFallback name={name} className="text-5xl" />
          </Avatar>
        </div>
        <div className="flex-1 min-w-0 pb-3">
          <div className="flex items-center gap-2.5">
            <h1 className="t-display text-ink-9">{name}</h1>
            {isPremium(profile) && <PremiumBadge showText />}
          </div>
          <p className="t-callout muted mt-1">{metaText}</p>
        </div>
        {actions && <div className="flex gap-2 pb-3 flex-shrink-0">{actions}</div>}
      </div>
    </>
  );
}
