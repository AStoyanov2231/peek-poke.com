"use client";

import { memo, useCallback, useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Marker } from "react-map-gl/mapbox";
import { X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useOnlineUsers } from "@/stores/selectors";
import { UserPinContent } from "@/components/map/UserPin";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import type { NearbyUser, ProfilePhoto, ProfileInterest } from "@/types/database";
import { cn } from "@/lib/utils";

interface HighlightedPinProps {
  user: NearbyUser;
  isFriend: boolean;
  isPremium: boolean;
  initialData: { photos: ProfilePhoto[]; interests: ProfileInterest[]; bio?: string | null };
}

export const HighlightedPin = memo(function HighlightedPin({ user, isFriend, isPremium, initialData }: HighlightedPinProps) {
  const setHighlightedUserId = useAppStore((s) => s.setHighlightedUserId);
  const onlineUsers = useOnlineUsers();
  const [isDesktop, setIsDesktop] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isOnline = onlineUsers.has(user.userId);
  const name = user.display_name || user.username || "";

  const handleSendMessage = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/dm/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.userId }),
        });
        if (res.ok) {
          const d = await res.json();
          setHighlightedUserId(null);
          window.location.href = `/inbox?tab=chats&thread=${d.id}`;
        }
      } catch (err) { console.error("Failed to start DM:", err); }
    });
  }, [user.userId, setHighlightedUserId, startTransition]);

  const interests = initialData.interests
    .filter((i) => i.tag?.name)
    .slice(0, 3)
    .map((i) => i.tag!.name);

  const cardContent = (
    <div
      className={cn(
        "card rounded-[22px] shadow-e-3 p-4",
        isDesktop ? "w-80" : "w-full"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex gap-3 items-center">
        <Avatar className="w-14 h-14 flex-shrink-0">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback name={name} />
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="t-title-3 text-ink-9">{name}</span>
            {isPremium && <PremiumBadge size="sm" showText />}
          </div>
          {isOnline && (
            <span className="t-caption font-semibold mt-0.5 block" style={{ color: "var(--success-600)" }}>
              ● Online now
            </span>
          )}
        </div>
        <button
          aria-label="Close"
          className="iconbtn iconbtn-sm"
          style={{ background: "transparent", boxShadow: "none" }}
          onClick={() => setHighlightedUserId(null)}
        >
          <X size={18} />
        </button>
      </div>

      {/* Bio */}
      {initialData.bio && (
        <p className="t-body mt-3" style={{ color: "var(--ink-7)" }}>{initialData.bio}</p>
      )}

      {/* Interest chips */}
      {interests.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {interests.map((tag) => (
            <span key={tag} className="chip" style={{ height: 26, fontSize: 12 }}>{tag}</span>
          ))}
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-2 mt-3.5">
        <button
          className="btn btn-accent btn-md flex-1 rounded-xl"
          onClick={handleSendMessage}
        >
          <span className="text-base leading-none">👋</span> Say hi
        </button>
        <button
          className="btn btn-secondary btn-md flex-1 rounded-xl"
          onClick={() => { window.location.href = `/profile/${user.userId}`; }}
        >
          Profile
        </button>
      </div>

      {!isFriend && (
        <p className="t-caption text-center mt-2.5" style={{ color: "var(--ink-5)" }}>
          Costs <b style={{ color: "var(--ink-7)" }}>1 coin</b> to open a chat with a non-friend
        </p>
      )}
    </div>
  );

  const portalEl = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      <Marker longitude={user.lng} latitude={user.lat} anchor="center" style={{ zIndex: 10 }}>
        <div className="pin-pop-in">
          <UserPinContent user={user} isFriend={isFriend} isHighlighted />
        </div>
      </Marker>

      {portalEl && createPortal(
        <>
          {/* Mobile: fixed bottom card */}
          <div
            className="md:hidden fixed z-40 inset-x-4"
            style={{ bottom: "calc(108px + env(safe-area-inset-bottom, 0px))", animation: "slide-up-in 0.3s ease-out" }}
          >
            {cardContent}
          </div>

          {/* Desktop: fixed top-right panel */}
          <div
            className="hidden md:block fixed z-40"
            style={{ top: 70, right: 16 }}
          >
            {cardContent}
          </div>
        </>,
        portalEl
      )}
    </>
  );
});
