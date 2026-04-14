"use client";

import { useMemo, useRef } from "react";
import { useNearbyUsers, useVisibleUsers, useSelectedClusterUserIds, useHighlightedUserId, useUserLocation, usePendingUserId } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { formatDistance } from "@/lib/geo";
import { AVATAR_COLORS } from "@/lib/constants";

const MAX_VISIBLE = 10;

export function NearbySwiper() {
  const nearbyUsers = useNearbyUsers();
  const visibleUsers = useVisibleUsers();
  const clusterIds = useSelectedClusterUserIds();
  const highlightedUserId = useHighlightedUserId();
  const pendingUserId = usePendingUserId();
  const selectUser = useAppStore((s) => s.selectUser);
  const userLocation = useUserLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayed = useMemo(() => {
    if (clusterIds) return nearbyUsers.filter(u => clusterIds.includes(u.userId));
    return visibleUsers;
  }, [clusterIds, nearbyUsers, visibleUsers]);

  if (displayed.length === 0) return null;

  const visibleSlice = displayed.slice(0, MAX_VISIBLE);

  return (
    <div className="md:hidden absolute bottom-28 left-0 right-0 z-40 pointer-events-none">
      <div className="px-4">
        {/* Cards scroll */}
        <div
          ref={scrollRef}
          className="flex-1 min-w-0 overflow-x-auto scrollbar-none flex gap-3.5 snap-x snap-mandatory"
        >
          {visibleSlice.map((user, i) => {
            const name = user.display_name || user.username;
            const initial = name?.[0]?.toUpperCase() || "?";
            const selected = user.userId === highlightedUserId;
            const pending = user.userId === pendingUserId;
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const distance = userLocation
              ? formatDistance(userLocation.lat, userLocation.lng, user.lat, user.lng)
              : null;

            return (
              <button
                key={user.userId}
                onClick={() => selectUser(user.userId)}
                className={`pointer-events-auto snap-start shrink-0 w-[120px] h-[120px] rounded-[20px] overflow-hidden isolate relative transition-all active:scale-[0.97] ${
                  selected ? "ring-2 ring-inset ring-[#6C63FF]" : ""
                } ${pending ? "opacity-60" : ""}`}
              >
                {/* Fallback always rendered as base layer */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: color.bg }}
                >
                  <span className="text-4xl font-bold" style={{ color: color.text }}>
                    {initial}
                  </span>
                </div>

                {/* Image on top — hides itself on error to reveal fallback */}
                {user.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}

                {/* Gradient overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }}
                />

                {/* Text — bottom-centered */}
                <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 flex flex-col">
                  <span className="text-[13px] font-bold text-white leading-tight truncate w-full text-center">
                    {name}
                  </span>
                  {distance && (
                    <span className="text-[10px] text-white/75 font-medium mt-0.5">
                      {distance}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
