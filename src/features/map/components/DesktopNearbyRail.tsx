"use client";

import React, { useState, useMemo, useRef, memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";
import { useNearbyUsers, useFriends, useUserLocation, useHighlightedUserId } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { formatDistance } from "@/lib/geo";
import { avatarColor } from "@/lib/avatar-color";
import { SearchAutocomplete } from "@/features/search/components/SearchAutocomplete";
import { AddFriendButton } from "@/components/ui/AddFriendButton";
import type { NearbyUser } from "@/types/database";
import { filterNearbyUsers, mapFilterOptions } from "@/features/map/filters";

interface NearbyRailRowProps {
  user: NearbyUser;
  isOnline: boolean;
  isSelected: boolean;
  distance: string | null;
  onSelect: (userId: string) => void;
}

const NearbyRailRow = memo(function NearbyRailRow({ user, isOnline, isSelected, distance, onSelect }: NearbyRailRowProps) {
  const name = user.display_name || user.username || "?";
  const color = avatarColor(name);

  return (
    <div
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-colors"
      style={{ background: isSelected ? "var(--ink-1)" : "transparent" }}
    >
      <button type="button"
        onClick={() => onSelect(user.userId)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
            style={{ background: color.bg, color: color.fg }}
          >
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={name}
                width={64}
                height={64}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              name[0]?.toUpperCase()
            )}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-surface block" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="t-body-b text-ink-9 truncate">{name}</div>
          <div className="t-caption muted">
            {distance && `${distance} · `}{isOnline ? "Online" : "Offline"}
          </div>
        </div>
      </button>

      <AddFriendButton userId={user.userId} />
    </div>
  );
});

export function DesktopNearbyRail() {
  const [cursorPos, setCursorPos] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const nearbyUsers = useNearbyUsers();
  const friends = useFriends();
  const userLocation = useUserLocation();
  const highlightedUserId = useHighlightedUserId();
  const selectUser = useAppStore((s) => s.selectUser);
  const filter = useAppStore((s) => s.mapFilter);
  const query = useAppStore((s) => s.mapSearchQuery);
  const setMapFilter = useAppStore((s) => s.setMapFilter);
  const setMapSearchQuery = useAppStore((s) => s.setMapSearchQuery);

  const nearbyIds = useMemo(() => nearbyUsers.map((u) => u.userId), [nearbyUsers]);
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const filtered = useMemo(
    () => filterNearbyUsers(nearbyUsers, filter, friendIds, query),
    [nearbyUsers, filter, query, friendIds],
  );

  const handleReplaceActiveTag = useCallback(({ name }: { name: string }) => {
    const beforeCursor = query.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1) return;
    const afterAt = query.slice(atIndex);
    const spaceIndex = afterAt.indexOf(' ');
    const tokenEnd = spaceIndex === -1 ? query.length : atIndex + spaceIndex + 1;
    const newQuery = query.slice(0, atIndex) + `@${name} ` + query.slice(tokenEnd);
    setMapSearchQuery(newQuery);
    setCursorPos(atIndex + name.length + 2);
  }, [cursorPos, query, setMapSearchQuery]);

  return (
    <div
      className="hidden md:flex flex-col flex-shrink-0 border-r border-hairline bg-surface pointer-events-auto"
      style={{ width: 340 }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3.5">
        <h1 className="t-title-1 text-ink-9" style={{ margin: 0 }}>Nearby</h1>
        <p className="t-callout muted mt-0.5">{nearbyUsers.length} people within 2 km</p>

        {/* Search */}
        <div
          ref={searchRef}
          className="relative mt-3.5 h-10 flex items-center gap-2 px-3.5 rounded-xl border border-hairline"
          style={{ background: "var(--ink-1)" }}
        >
          <Search size={15} strokeWidth={2} style={{ color: "var(--ink-5)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search people nearby"
            value={query}
            onChange={(e) => setMapSearchQuery(e.target.value)}
            onKeyUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
            onMouseUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
            onSelect={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
            className="flex-1 bg-transparent border-0 outline-none t-body text-ink-8 placeholder:text-ink-5"
            style={{ userSelect: "text" }}
          />
          {query.length > 0 && (
            <SearchAutocomplete
              value={query}
              cursorPos={cursorPos}
              anchorRef={searchRef as React.RefObject<HTMLElement>}
              nearbyIds={nearbyIds}
              onSelectUser={(userId) => router.push(`/profile/${userId}`)}
              onReplaceActiveTag={handleReplaceActiveTag}
              onClose={() => setMapSearchQuery('')}
              className="absolute left-0 right-0 top-full mt-1 z-50"
            />
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 mt-3">
          {mapFilterOptions.map(({ value: f, label }) => (
            <button type="button"
              key={f}
              onClick={() => setMapFilter(f)}
              className={filter === f ? "chip chip-active" : "chip"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-3">
        {filtered.map((user) => (
          <NearbyRailRow
            key={user.userId}
            user={user}
            isOnline={user.is_online === true}
            isSelected={user.userId === highlightedUserId}
            distance={userLocation ? formatDistance(userLocation.lat, userLocation.lng, user.lat, user.lng) : null}
            onSelect={selectUser}
          />
        ))}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <span className="t-body muted">No one nearby</span>
          </div>
        )}
      </div>
    </div>
  );
}
