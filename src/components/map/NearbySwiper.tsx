"use client";

import { useMemo, useRef } from "react";
import { useNearbyUsers, useVisibleUsers, useSelectedClusterUserIds, useHighlightedUserId, useUserLocation, usePendingUserId, useOnlineUsers } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { formatDistance } from "@/lib/geo";
import { avatarColor } from "@/lib/avatar-color";


const MAX_VISIBLE = 10;

export function NearbySwiper() {
  const nearbyUsers = useNearbyUsers();
  const visibleUsers = useVisibleUsers();
  const clusterIds = useSelectedClusterUserIds();
  const highlightedUserId = useHighlightedUserId();
  const pendingUserId = usePendingUserId();
  const onlineUsers = useOnlineUsers();
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
    <div className="md:hidden absolute left-4 right-4 z-40 pointer-events-none" style={{ bottom: "calc(94px + env(safe-area-inset-bottom, 0px))", animation: "slide-up-in 0.3s ease-out" }}>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
      >
        {visibleSlice.map((user) => {
          const name = user.display_name || user.username;
          const initial = name?.[0]?.toUpperCase() || "?";
          const selected = user.userId === highlightedUserId;
          const pending = user.userId === pendingUserId;
          const isOnline = onlineUsers.has(user.userId);
          const color = avatarColor(name || "?");
          const distance = userLocation
            ? formatDistance(userLocation.lat, userLocation.lng, user.lat, user.lng)
            : null;

          return (
            <button
              key={user.userId}
              onClick={() => selectUser(user.userId)}
              className={`pointer-events-auto snap-center flex-shrink-0 w-full flex items-center gap-3 p-3.5 rounded-[18px] text-left border-0 transition-all active:scale-[0.98] cursor-pointer ${
                pending ? "opacity-60" : ""
              }`}
              style={{
                background: "rgba(255,255,255,0.96)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                boxShadow: selected
                  ? `0 0 0 2px var(--primary-500), var(--e-2)`
                  : "var(--e-2)",
              }}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold overflow-hidden"
                  style={{ background: color.bg, color: color.fg }}
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={name ?? undefined}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    initial
                  )}
                </div>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white block" style={{ background: "var(--success-500)" }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="t-body-b text-ink-9 truncate">{name}</div>
                <div className="t-caption mt-0.5" style={{ color: "var(--ink-5)" }}>
                  {distance && `${distance} · `}{isOnline ? "Online" : "Offline"}
                </div>
              </div>

            </button>
          );
        })}
      </div>
    </div>
  );
}
