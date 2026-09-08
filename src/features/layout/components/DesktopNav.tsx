"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  MapPin,
  Mail,
  Users,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import {
  useProfile,
  useFriendRequestCount,
  useTotalUnread,
  useHasRole,
} from "@/stores/selectors";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrandMark } from "@/components/ui/BrandMark";
import { cn } from "@/lib/utils";
import { usePokeInbox } from "@/features/inbox/usePokeInbox";

export function DesktopNav() {
  const pathname = usePathname();
  const profile = useProfile();
  const { pendingReceivedCount } = usePokeInbox();
  const unread =
    useTotalUnread() + useFriendRequestCount() + pendingReceivedCount;
  const isAdmin = useHasRole("admin");
  if (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/group") ||
    pathname === "/onboarding"
  )
    return null;
  const items = [
    { href: "/now", label: "Now", Icon: Compass },
    { href: "/map", label: "Map", Icon: MapPin },
    { href: "/inbox", label: "Inbox", Icon: Mail },
    { href: "/friends", label: "Your people", Icon: Users },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", Icon: Shield }] : []),
  ];
  const name = profile?.display_name ?? profile?.username ?? "Your profile";
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-hairline bg-surface md:flex">
      <Link
        href="/now"
        aria-label="Peek and Poke home"
        className="flex items-center gap-2 px-6 py-8"
      >
        <BrandMark />
        <span className="text-lg font-bold tracking-[-.06em]">
          peek & poke<span className="text-primary">.</span>
        </span>
      </Link>
      <nav aria-label="Main navigation" className="grid gap-2 px-4">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname.startsWith(href) ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold transition-colors",
              pathname.startsWith(href)
                ? "bg-primary-50 text-primary"
                : "text-ink-6 hover:bg-ink-1",
            )}
          >
            <Icon size={21} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {href === "/inbox" && unread > 0 && (
              <span className="badge">{unread > 99 ? "99+" : unread}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="mx-6 mb-7 border-t border-hairline pt-5">
        <p className="text-[20px] font-semibold leading-tight tracking-tight">
          A little poke.
          <br />
          <span className="text-ink-5">A good afternoon.</span>
        </p>
        <Link
          href="/safety"
          className="mt-4 flex min-h-11 items-center gap-2 text-xs font-medium text-ink-6"
        >
          Meet with confidence <ArrowUpRight size={14} />
        </Link>
      </div>
      <Link
        href="/profile"
        aria-current={pathname === "/profile" ? "page" : undefined}
        className="mx-4 mb-6 flex min-w-0 items-center gap-3 rounded-2xl bg-ink-1 p-3"
      >
        <Avatar className="h-10 w-10">
          {profile?.avatar_url && (
            <AvatarImage src={profile.avatar_url} alt={name} />
          )}
          <AvatarFallback name={name} />
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-ink-6">Me & my settings</p>
        </div>
      </Link>
    </aside>
  );
}
