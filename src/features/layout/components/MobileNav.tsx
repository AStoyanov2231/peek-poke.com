"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MapPin, Mail, QrCode, User, Shield } from "lucide-react";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { useFriendRequestCount, useTotalUnread, useHasRole } from "@/stores/selectors";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";

interface MobileTab {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: boolean;
}

const baseTabs: MobileTab[] = [
  { href: "/",         label: "Map",      Icon: MapPin },
  { href: "/inbox",    label: "Inbox",    Icon: Mail,  badge: true },
  { href: "/rooms",    label: "Rooms",    Icon: QrCode },
  { href: "/profile",  label: "Me",       Icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  const isKeyboardVisible = useKeyboardVisible();

  if (
    isKeyboardVisible ||
    pathname === "/onboarding" ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/room/")
  ) return null;

  return <MobileNavInner />;
}

function MobileNavInner() {
  const pathname = usePathname();
  const router = useTransitionRouter();
  const unreadCount = useTotalUnread();
  const friendRequestCount = useFriendRequestCount();
  const isAdmin = useHasRole("admin");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => { setPendingHref(null); }, [pathname]);

  const activeHref = pendingHref ?? pathname;
  const rawBadgeCount = friendRequestCount > 0 ? friendRequestCount : unreadCount;
  const tabs: MobileTab[] = [
    ...baseTabs,
    ...(isAdmin ? [{ href: "/admin", label: "Admin", Icon: Shield }] : []),
  ];

  return (
    <nav
      aria-label="Main navigation"
      className="mobile-nav-shell flex md:hidden fixed z-40"
      style={{ bottom: `calc(22px + env(safe-area-inset-bottom, 0px))` }}
    >
      {tabs.map(({ href, label, Icon, badge }) => {
        const isActive = href === "/" ? activeHref === "/" : activeHref.startsWith(href);
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
            className="relative flex flex-col items-center justify-center gap-[3px] flex-1 h-full border-0 bg-transparent cursor-pointer transition-colors"
            style={{ color: isActive ? "var(--primary-500)" : "var(--ink-5)" }}
          >
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b"
                style={{ width: 28, height: 3, background: "var(--primary-500)", borderRadius: "0 0 4px 4px" }}
              />
            )}
            <div className="relative">
              <Icon
                size={22}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {badgeCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 badge"
                  style={{ fontSize: 12, minWidth: 16, height: 16 }}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, lineHeight: 1 }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
