"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/appStore";
import { useFriends, useNearbyUsers } from "@/stores/selectors";
import { SearchAutocomplete } from "@/features/search/components/SearchAutocomplete";
import { filterNearbyUsers, mapFilterOptions } from "@/features/map/filters";

export function MapSearchBar() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const nearbyUsers = useNearbyUsers();
  const friends = useFriends();
  const filter = useAppStore((s) => s.mapFilter);
  const query = useAppStore((s) => s.mapSearchQuery);
  const setMapFilter = useAppStore((s) => s.setMapFilter);
  const setMapSearchQuery = useAppStore((s) => s.setMapSearchQuery);
  const setVisibleUsers = useAppStore((s) => s.setVisibleUsers);
  const router = useRouter();

  const nearbyIds = nearbyUsers.map((u) => u.userId);
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const filteredUsers = useMemo(
    () => filterNearbyUsers(nearbyUsers, filter, friendIds, query),
    [filter, friendIds, nearbyUsers, query],
  );

  useEffect(() => {
    setVisibleUsers(filteredUsers);
  }, [filteredUsers, setVisibleUsers]);

  const handleSearch = (value: string) => {
    setMapSearchQuery(value);
  };

  const handleReplaceActiveTag = ({ name }: { name: string }) => {
    const beforeCursor = query.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1) return;
    const afterAt = query.slice(atIndex);
    const spaceIndex = afterAt.indexOf(' ');
    // consume the trailing space so replacement @name<space> doesn't produce double-space
    const tokenEnd = spaceIndex === -1 ? query.length : atIndex + spaceIndex + 1;
    const newQuery = query.slice(0, atIndex) + `@${name} ` + query.slice(tokenEnd);
    handleSearch(newQuery);
    setCursorPos(atIndex + name.length + 2);
  };

  return (
    <div
      className="md:hidden absolute left-4 right-4 z-40 flex gap-2.5 pointer-events-auto"
      style={{ top: "calc(var(--safe-area-top) + 58px)" }}
    >
      {/* Search pill */}
      <div
        ref={containerRef}
        className="relative h-11 flex-1 flex items-center gap-2.5 px-3.5 rounded-md shadow-e-1"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <Search size={18} strokeWidth={2} style={{ color: "var(--ink-5)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search people nearby"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
          onMouseUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
          onSelect={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart ?? query.length)}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-ink-8 placeholder:text-ink-5"
          style={{ userSelect: "text" }}
        />
        {query.length > 0 && (
          <SearchAutocomplete
            value={query}
            cursorPos={cursorPos}
            anchorRef={containerRef as React.RefObject<HTMLElement>} // HTMLDivElement extends HTMLElement; cast is safe
            nearbyIds={nearbyIds}
            onSelectUser={(userId) => router.push(`/profile/${userId}`)}
            onReplaceActiveTag={handleReplaceActiveTag}
            onClose={() => handleSearch('')}
            className="absolute left-0 right-0 top-full mt-1 z-50"
          />
        )}
      </div>

      {/* Filter button */}
      <button type="button"
        className="iconbtn"
        style={{
          width: 44, height: 44,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        aria-expanded={filterOpen}
        aria-haspopup="menu"
        aria-label="Filter"
        onClick={() => setFilterOpen((open) => !open)}
      >
        <Filter size={18} strokeWidth={2} />
      </button>
      {filterOpen && (
        <div
          role="menu"
          aria-label="Filter nearby people"
          className="absolute right-0 top-full mt-1 flex min-w-36 flex-col rounded-md p-1 shadow-e-2"
          style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)" }}
        >
          {mapFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={filter === option.value}
              className="min-h-11 rounded px-3 text-left text-sm text-ink-8"
              onClick={() => {
                setMapFilter(option.value);
                setFilterOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
