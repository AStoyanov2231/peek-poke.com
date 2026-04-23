"use client";

import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useNearbyUsers } from "@/stores/selectors";

export function MapSearchBar() {
  const [query, setQuery] = useState("");
  const nearbyUsers = useNearbyUsers();
  const setVisibleUsers = useAppStore((s) => s.setVisibleUsers);

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

  return (
    <div
      className="md:hidden absolute left-4 right-4 z-30 flex gap-2.5"
      style={{ top: "calc(var(--safe-area-top) + 58px)" }}
    >
      {/* Search pill */}
      <div
        className="h-11 flex-1 flex items-center gap-2.5 px-3.5 rounded-md shadow-e-1"
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
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-ink-8 placeholder:text-ink-5"
          style={{ userSelect: "text" }}
        />
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
