"use client";

import React, { useRef, useState } from "react";
import { Search, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/appStore";
import { useNearbyUsers } from "@/stores/selectors";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";

export function MapSearchBar() {
  const [query, setQuery] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const nearbyUsers = useNearbyUsers();
  const setVisibleUsers = useAppStore((s) => s.setVisibleUsers);
  const router = useRouter();

  const nearbyIds = nearbyUsers.map((u) => u.userId);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setVisibleUsers(nearbyUsers);
      return;
    }
    const q = value.toLowerCase();
    const filtered = nearbyUsers.filter(
      (u) =>
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q)
    );
    setVisibleUsers(filtered);
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
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
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
      <button
        className="iconbtn"
        style={{
          width: 44, height: 44,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
        aria-label="Filter"
      >
        <Filter size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
