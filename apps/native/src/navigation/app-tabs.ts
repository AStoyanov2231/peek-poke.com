export function appTabIsActive(path: string, pathname: string) {
  if (path === "/map") return pathname === path;
  if (path === "/profile") return pathname.startsWith(path) || pathname.startsWith("/premium");
  if (path === "/inbox") return pathname.startsWith(path) || pathname.startsWith("/plans");
  return pathname.startsWith(path);
}

export function inboxBadgeCount({
  friendRequests,
  unread,
  pendingReceivedPokes,
}: {
  friendRequests: number;
  unread: number;
  pendingReceivedPokes: number;
}) {
  return friendRequests + unread + pendingReceivedPokes;
}
