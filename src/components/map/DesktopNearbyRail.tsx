"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useNearbyUsers, useOnlineUsers, useFriends, useUserLocation, useHighlightedUserId } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { formatDistance } from "@/lib/geo";
import { avatarColor } from "@/lib/avatar-color";

type Filter = "all" | "friends" | "online";

const FILTER_LABELS: Record<Filter, string> = { all: "All", friends: "Friends", online: "Online" };

export function DesktopNearbyRail() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const nearbyUsers = useNearbyUsers();
  const onlineUsers = useOnlineUsers();
  const friends = useFriends();
  const userLocation = useUserLocation();
  const highlightedUserId = useHighlightedUserId();
  const selectUser = useAppStore((s) => s.selectUser);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const filtered = useMemo(() => {
    let users = nearbyUsers;
    if (filter === "friends") users = users.filter((u) => friendIds.has(u.userId));
    if (filter === "online") users = users.filter((u) => onlineUsers.has(u.userId));
    if (query.trim()) {
      const q = query.toLowerCase();
      users = users.filter(
        (u) =>
          (u.display_name ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)
      );
    }
    return users;
  }, [nearbyUsers, filter, query, friendIds, onlineUsers]);

  return (
    <div
      className="hidden md:flex flex-col flex-shrink-0 border-r border-hairline bg-surface"
      style={{ width: 340 }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3.5">
        <h1 className="t-title-1 text-ink-9" style={{ margin: 0 }}>Nearby</h1>
        <p className="t-callout muted mt-0.5">{nearbyUsers.length} people within 2 km</p>

        {/* Search */}
        <div
          className="mt-3.5 h-10 flex items-center gap-2 px-3.5 rounded-xl border border-hairline"
          style={{ background: "var(--ink-1)" }}
        >
          <Search size={15} strokeWidth={2} style={{ color: "var(--ink-5)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search people nearby"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none t-body text-ink-8 placeholder:text-ink-5"
            style={{ userSelect: "text" }}
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 mt-3">
          {(["all", "friends", "online"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? "chip chip-active" : "chip"}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-3">
        {filtered.map((user) => {
          const name = user.display_name || user.username || "?";
          const isOnline = onlineUsers.has(user.userId);
          const isSelected = user.userId === highlightedUserId;
          const color = avatarColor(name);
          const distance = userLocation
            ? formatDistance(userLocation.lat, userLocation.lng, user.lat, user.lng)
            : null;

          return (
            <button
              key={user.userId}
              onClick={() => selectUser(user.userId)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left mb-0.5 border-0 cursor-pointer transition-colors"
              style={{ background: isSelected ? "var(--ink-1)" : "transparent" }}
            >
              {/* Avatar with online dot */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
                  style={{ background: color.bg, color: color.fg }}
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={name}
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

              {/* Name + distance */}
              <div className="flex-1 min-w-0">
                <div className="t-body-b text-ink-9 truncate">{name}</div>
                <div className="t-caption muted">
                  {distance && `${distance} · `}{isOnline ? "Online" : "Offline"}
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <span className="t-body muted">No one nearby</span>
          </div>
        )}
      </div>
    </div>
  );
}
