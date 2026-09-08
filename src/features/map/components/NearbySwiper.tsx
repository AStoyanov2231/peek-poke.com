"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useNearbyUsers, useVisibleUsers, useSelectedClusterUserIds, useHighlightedUserId, usePendingUserId } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { avatarColor } from "@/lib/avatar-color";
import { PokeDialog } from "@/features/social/components/PokeDialog";
import type { NearbyUser } from "@/types/database";
import { useAvailablePeople } from "@/features/map/useAvailablePeople";
import { activityLabel } from "@/data/pokes";


const MAX_VISIBLE = 10;

export function NearbySwiper() {
  const nearbyUsers = useNearbyUsers();
  const visibleUsers = useVisibleUsers();
  const clusterIds = useSelectedClusterUserIds();
  const highlightedUserId = useHighlightedUserId();
  const pendingUserId = usePendingUserId();
  const selectUser = useAppStore((s) => s.selectUser);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pokeUser, setPokeUser] = useState<NearbyUser | null>(null);
  const availablePeople = useAvailablePeople();
  const clusterIdSet = useMemo(() => clusterIds ? new Set(clusterIds) : null, [clusterIds]);

  const displayed = useMemo(() => {
    if (clusterIdSet) return nearbyUsers.filter(u => clusterIdSet.has(u.userId));
    return visibleUsers;
  }, [clusterIdSet, nearbyUsers, visibleUsers]);

  if (displayed.length === 0) return null;

  const visibleSlice = displayed.slice(0, MAX_VISIBLE);

  return (
    <div className="md:hidden absolute left-4 right-4 z-40 pointer-events-none" style={{ bottom: "calc(94px + env(safe-area-inset-bottom, 0px))", animation: "slide-up-in 0.3s ease-out" }}>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar pointer-events-auto"
      >
        {visibleSlice.map((user) => {
          const name = user.display_name || user.username;
          const initial = name?.[0]?.toUpperCase() || "?";
          const selected = user.userId === highlightedUserId;
          const pending = user.userId === pendingUserId;
          const isOnline = user.is_online === true;
          const color = avatarColor(name || "?");
          const availability = availablePeople.get(user.userId);

          return (
            <div
              key={user.userId}
              className={`pointer-events-auto snap-center flex-shrink-0 w-full flex items-center gap-3 p-3.5 rounded-[18px] transition-all ${
                pending ? "opacity-60" : ""
              }`}
              style={{
                background: "rgba(255,255,255,0.96)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: selected
                  ? `0 0 0 2px var(--primary-500), var(--e-2)`
                  : "var(--e-2)",
              }}
            >
              <button
                type="button"
                onClick={() => selectUser(user.userId)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] cursor-pointer"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold overflow-hidden"
                    style={{ background: color.bg, color: color.fg }}
                  >
                    {user.avatar_url ? (
                      <Image
                        src={user.avatar_url}
                        alt={name ?? undefined}
                        fill
                        sizes="48px"
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
                    {availability ? `Up for ${activityLabel(availability)} · ` : "In your area · "}{isOnline ? "Online" : "Offline"}
                  </div>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" className="btn btn-accent btn-sm" onClick={() => setPokeUser(user)}>Poke</button>
              </div>
            </div>
          );
        })}
      </div>
      {pokeUser ? <PokeDialog recipient={{ id: pokeUser.userId, username: pokeUser.username, display_name: pokeUser.display_name }} defaultActivity={availablePeople.get(pokeUser.userId)?.activity} defaultCustomLabel={availablePeople.get(pokeUser.userId)?.customLabel} onClose={() => setPokeUser(null)} onSent={() => setPokeUser(null)} /> : null}
    </div>
  );
}
