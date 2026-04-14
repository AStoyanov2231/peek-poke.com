"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { useFriendRequestCount, useTotalUnread } from "@/stores/selectors";
import { isNativeApp } from "@/lib/native";
import { navItems } from "@/lib/navigation";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { NavButton } from "./NavButton";

// Outer component: only the hooks needed for early-return checks run when nav is hidden.
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
    <>
    <nav
      className="md:hidden fixed bottom-1 left-1/2 -translate-x-1/2 z-40 bg-background rounded-xl flex justify-around items-center px-6 py-3 w-[280px] border border-border shadow-neu-floating"
    >
      {navItems.map((item) => {
        const isActive = item.href === "/" ? activeHref === "/" : activeHref.startsWith(item.href);
        const badgeCount = item.badge ? rawBadgeCount : 0;

        return (
          <NavButton
            key={item.href}
            item={item}
            isActive={isActive}
            badgeCount={badgeCount}
            onClick={() => {
              setPendingHref(item.href);
              router.push(item.href);
            }}
            className="flex items-center justify-center w-12 h-12"
          />
        );
      })}
    </nav>
    </>
  );
}
