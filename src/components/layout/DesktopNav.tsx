"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFriendRequestCount, useTotalUnread } from "@/stores/selectors";
import { navItems } from "@/lib/navigation";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { NavButton } from "./NavButton";

/**
 * Instagram-style collapsible sidebar for desktop (md+).
 * Collapses to icon-only (64px) and overlays content when hovered (220px).
 * Content offset is handled by ContentWrapper — sidebar does not push content on expand.
 */

// Outer component: only the hook needed for the early-return check runs when nav is hidden.
export function DesktopNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/chat") || pathname === "/onboarding") return null;

  return <DesktopNavInner />;
}

function DesktopNavInner() {
  const pathname = usePathname();
  const router = useTransitionRouter();
  const unreadCount = useTotalUnread();
  const friendRequestCount = useFriendRequestCount();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => { setPendingHref(null); }, [pathname]);

  const activeHref = pendingHref ?? pathname;
  const rawBadgeCount = friendRequestCount > 0 ? friendRequestCount : unreadCount;

  return (
    <aside aria-label="Main navigation" className="group fixed left-3 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col w-16 hover:w-[220px] transition-[width] duration-200 ease-in-out overflow-hidden bg-background/70 backdrop-blur-sm rounded-3xl shadow-lg py-3">
      <nav className="flex flex-col gap-3 px-2">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? activeHref === "/" : activeHref.startsWith(item.href);
          const badgeCount = item.badge ? rawBadgeCount : 0;

          return (
            <NavButton
              key={item.href}
              item={item}
              isActive={isActive}
              badgeCount={badgeCount}
              variant="subtle"
              onClick={() => {
                setPendingHref(item.href);
                router.push(item.href);
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-3 w-full",
                !isActive && "hover:bg-black/5"
              )}
            >
              <span aria-hidden="true" className="relative z-10 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap">
                {item.label}
              </span>
            </NavButton>
          );
        })}
      </nav>
    </aside>
  );
}
