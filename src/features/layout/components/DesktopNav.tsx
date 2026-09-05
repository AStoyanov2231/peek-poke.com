"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MapPin, Mail, Coins, Shield } from "lucide-react";
import { useProfile, useCoins, useFriendRequestCount, useTotalUnread, useHasRole } from "@/stores/selectors";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const MAX_COINS = 5;

interface DesktopNavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: boolean;
}

const desktopNavItems: DesktopNavItem[] = [
  { href: "/",         label: "Map",      Icon: MapPin },
  { href: "/inbox",    label: "Inbox",    Icon: Mail, badge: true },
];

export function DesktopNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/chat") || pathname.startsWith("/group") || pathname === "/onboarding") return null;
  return <DesktopNavInner />;
}

function DesktopNavInner() {
  const pathname = usePathname();
  const router = useTransitionRouter();
  const profile = useProfile();
  const coins = useCoins();
  const unreadCount = useTotalUnread();
  const friendRequestCount = useFriendRequestCount();
  const isAdmin = useHasRole("admin");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => { setPendingHref(null); }, [pathname]);

  const activeHref = pendingHref ?? pathname;
  const rawBadgeCount = friendRequestCount > 0 ? friendRequestCount : unreadCount;

  const navItems: DesktopNavItem[] = [
    ...desktopNavItems,
    ...(isAdmin ? [{ href: "/admin", label: "Admin", Icon: Shield }] : []),
  ];

  const displayName = profile?.display_name ?? profile?.username ?? "You";
  const handle = profile?.username ? `@${profile.username}` : "";

  return (
    <aside
      aria-label="Main navigation"
      className="hidden md:flex flex-col flex-shrink-0 border-r border-hairline bg-surface"
      style={{ width: 240, minHeight: 0 }}
    >
      <div className="flex flex-col h-full py-5 px-3.5">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2.5 pb-4">
          <div
            className="flex items-center justify-center rounded-[10px] text-white font-bold text-sm"
            style={{ width: 32, height: 32, background: "var(--ink-9)", letterSpacing: "-0.02em" }}
          >
            P
          </div>
          <span className="t-title-3 text-ink-9">Peek &amp; Poke</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, Icon, badge }) => {
            const isActive = href === "/" ? activeHref === "/" : activeHref.startsWith(href.split("?")[0]);
            const badgeCount = badge ? rawBadgeCount : 0;

            return (
              <button type="button"
                key={href}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setPendingHref(href);
                  router.push(href);
                }}
                className={cn(
                  "flex items-center gap-3 h-10 px-3 rounded-[10px] text-sm font-medium border-0 cursor-pointer transition-colors text-left",
                  isActive
                    ? "bg-ink-1 text-ink-9 font-semibold"
                    : "bg-transparent text-ink-6 hover:bg-ink-1 hover:text-ink-8"
                )}
                style={isActive ? { boxShadow: "inset 3px 0 0 var(--primary-500)" } : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="flex-1">{label}</span>
                {badgeCount > 0 && (
                  <span className="badge" style={{ background: "var(--primary-500)", fontSize: 12, minWidth: 16, height: 16 }}>
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Coin widget */}
        <div
          className="rounded-xl border border-hairline p-3 mb-3.5"
          style={{ background: "var(--ink-1)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Coins size={14} strokeWidth={2} style={{ color: "oklch(0.65 0.15 85)" }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{coins} / {MAX_COINS} coins</span>
          </div>
          <div className="h-1 rounded-pill overflow-hidden" style={{ background: "var(--ink-3)" }}>
            <div
              className="h-full rounded-pill"
              style={{ width: `${(coins / MAX_COINS) * 100}%`, background: "var(--primary-500)" }}
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-5)", marginTop: 6 }}>
            Meet a friend nearby to earn more
          </div>
        </div>

        {/* User card */}
        <button type="button"
          aria-label="Go to profile"
          onClick={() => router.push("/profile")}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-hairline cursor-pointer text-left transition-colors bg-[var(--surface)] hover:bg-ink-1 w-full"
        >
          <Avatar className="w-8 h-8 flex-shrink-0">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
            <AvatarFallback name={displayName} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ink-9 truncate">{displayName}</div>
            {handle && <div className="text-xs text-ink-5 truncate">{handle}</div>}
          </div>
        </button>
      </div>
    </aside>
  );
}
