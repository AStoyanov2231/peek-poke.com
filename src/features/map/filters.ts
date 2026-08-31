import type { NearbyUser } from "@/types/database";

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
    const searchable = (user.display_name ?? "") + " " + (user.username ?? "");
    return !query || searchable.toLowerCase().includes(query);
  });
}
