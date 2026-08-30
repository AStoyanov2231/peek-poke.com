import type { NearbyUser } from "@peekpoke/shared";
import { minimumTouchTarget, type NativeTouchPlatform } from "@/components/ui-touch-targets";

export type MapFilter = "all" | "friends" | "online";

export const mapFilterOptions: { value: MapFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "friends", label: "Friends" },
  { value: "online", label: "Online" },
];

export function filterNearbyUsers(
  nearbyUsers: NearbyUser[],
  filter: MapFilter,
  friendIds: ReadonlySet<string>,
  queryText: string,
) {
  const query = queryText.trim().toLowerCase();
  return nearbyUsers.filter((user) => {
    if (filter === "friends" && !friendIds.has(user.userId)) return false;
    if (filter === "online" && user.is_online !== true) return false;
    return !query || `${user.display_name ?? ""} ${user.username ?? ""}`.toLowerCase().includes(query);
  });
}

export function nearbyCardIsOnline(user: NearbyUser) {
  return user.is_online === true;
}

export function visibleHighlightedUser(nearbyUsers: NearbyUser[], highlightedUserId: string | null) {
  return highlightedUserId
    ? nearbyUsers.find((user) => user.userId === highlightedUserId) ?? null
    : null;
}

export function visibleSelectedClusterUsers(
  filteredUsers: NearbyUser[],
  selectedClusterUserIds: string[] | null,
) {
  if (!selectedClusterUserIds) return filteredUsers;
  const selectedIds = new Set(selectedClusterUserIds);
  return filteredUsers.filter((user) => selectedIds.has(user.userId));
}

export function mapFilterControlAccessibility(filter: MapFilter, expanded: boolean) {
  const label = mapFilterOptions.find((option) => option.value === filter)?.label ?? "All";
  return {
    label: `Filter nearby people: ${label}`,
    hint: "Choose All, Friends, or Online people to show on the map",
    state: { expanded },
  };
}

export function mapFilterOptionAccessibility(filter: MapFilter, selected: boolean) {
  const label = mapFilterOptions.find((option) => option.value === filter)?.label ?? "All";
  return { label, role: "button" as const, state: { selected } };
}

export function mapFilterOptionMinHeight(platform: NativeTouchPlatform) {
  return minimumTouchTarget(platform);
}
