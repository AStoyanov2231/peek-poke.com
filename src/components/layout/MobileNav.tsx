"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MapPin, Mail, User } from "lucide-react";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { useFriendRequestCount, useTotalUnread } from "@/stores/selectors";
import { isNativeApp } from "@/lib/native";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";

interface MobileTab {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: boolean;
}

const tabs: MobileTab[] = [
  { href: "/",         label: "Map",      Icon: MapPin },
  { href: "/inbox",    label: "Inbox",    Icon: Mail,  badge: true },
  { href: "/profile",  label: "Me",       Icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  const isKeyboardVisible = useKeyboardVisible();

  if (
    isNativeApp() ||
    isKeyboardVisible ||
    pathname === "/onboarding" ||
    pathname.startsWith("/chat/")
  ) return null;

  return <MobileNavInner />;
}

function MobileNavInner() {
  const pathname = usePathname();
  const router = useTransitionRouter();
  const unreadCount = useTotalUnread();
  const friendRequestCount = useFriendRequestCount();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => { setPendingHref(null); }, [pathname]);

  const activeHref = pendingHref ?? pathname;
  const rawBadgeCount = friendRequestCount > 0 ? friendRequestCount : unreadCount;

  return (
    <nav
      aria-label="Main navigation"
      className="flex md:hidden fixed z-40"
      style={{
        left: 16, right: 16,
        bottom: `calc(22px + env(safe-area-inset-bottom, 0px))`,
        height: 64,
        borderRadius: 22,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "var(--e-2)",
        alignItems: "center",
        padding: "0 8px",
      }}
    >
      {tabs.map(({ href, label, Icon, badge }) => {
        const isActive = href === "/" ? activeHref === "/" : activeHref.startsWith(href);
        const badgeCount = badge ? rawBadgeCount : 0;

        return (
          <button
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
                  style={{ fontSize: 10, minWidth: 16, height: 16 }}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500, lineHeight: 1 }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
