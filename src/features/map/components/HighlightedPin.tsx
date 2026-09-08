"use client";

import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Marker } from "react-map-gl/mapbox";
import { useTransitionRouter } from "@/hooks/useTransitionRouter";
import { Clock3, X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { UserPinContent } from "@/features/map/components/UserPin";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { Availability, ProfileInterestDto, PublicProfilePhoto } from "@peekpoke/shared";
import type { NearbyUser } from "@/types/database";
import { cn } from "@/lib/utils";
import { PokeDialog } from "@/features/social/components/PokeDialog";
import { activityInfo, remainingAvailability } from "@/features/now/activities";

interface HighlightedPinProps {
  user: NearbyUser;
  isFriend: boolean;
  availability?: Availability;
  initialData: { photos: PublicProfilePhoto[]; interests: ProfileInterestDto[]; bio?: string | null };
}

export const HighlightedPin = memo(function HighlightedPin({ user, isFriend, availability, initialData }: HighlightedPinProps) {
  const router = useTransitionRouter();
  const setHighlightedUserId = useAppStore((s) => s.setHighlightedUserId);
  const [isDesktop, setIsDesktop] = useState(false);
  const [pokeOpen, setPokeOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isOnline = user.is_online === true;
  const name = user.display_name || user.username || "";
  const activity = availability ? activityInfo(availability.activity) : null;
  const ActivityIcon = activity?.Icon;
  const activityLabel = availability?.activity === "custom" ? availability.customLabel : activity?.label.toLowerCase();

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
      {availability && ActivityIcon ? <div className="map-activity-card mb-4 flex items-start gap-3 rounded-xl p-3">
        <ActivityIcon size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0"><p className="text-base font-semibold">Up for {activityLabel}</p><p className="mt-1 flex items-center gap-1.5 text-xs"><Clock3 size={13} aria-hidden="true" />{remainingAvailability(availability.expiresAt, Date.now())}</p></div>
      </div> : null}
      <div className="flex gap-3 items-center">
        <Avatar className="w-14 h-14 flex-shrink-0">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback name={name} />
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="t-title-3 text-ink-9">{name}</span>
          </div>
          {isOnline && (
            <span className="t-caption font-semibold mt-0.5 block" style={{ color: "var(--success-600)" }}>
              ● Online now
            </span>
          )}
          <span className="mt-1 block text-xs text-ink-6">Approximate area{isFriend ? " · Your friend" : ""}</span>
        </div>
        <button type="button"
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
        <button type="button"
          className="btn btn-accent btn-md flex-1 rounded-xl"
          onClick={() => setPokeOpen(true)}
        >
          Poke
        </button>
        <button type="button"
          className="btn btn-secondary btn-md flex-1 rounded-xl"
          onClick={() => { router.push(`/profile/${user.userId}`); }}
        >
          Profile
        </button>
      </div>

    </div>
  );

  const portalEl = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      <Marker longitude={user.lng} latitude={user.lat} anchor="center" style={{ zIndex: 10 }}>
        <div className="pin-pop-in">
          <UserPinContent user={user} isFriend={isFriend} isHighlighted availability={availability} />
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
      {pokeOpen ? <PokeDialog recipient={{ id: user.userId, username: user.username, display_name: user.display_name }} defaultActivity={availability?.activity} defaultCustomLabel={availability?.customLabel} onClose={() => setPokeOpen(false)} onSent={() => setPokeOpen(false)} /> : null}
    </>
  );
});
