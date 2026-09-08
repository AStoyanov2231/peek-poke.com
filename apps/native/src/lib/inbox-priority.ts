export type InboxTab = "chats" | "pokes" | "plans" | "friends" | "requests";

export function explicitInboxTab(value: string | string[] | undefined): InboxTab | null {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "chats" || tab === "pokes" || tab === "plans" || tab === "friends" || tab === "requests"
    ? tab
    : null;
}

export function preferredInboxTab({
  pendingReceivedPokeCount,
  actionablePlanCount,
}: {
  pendingReceivedPokeCount: number;
  actionablePlanCount: number;
}): InboxTab {
  if (pendingReceivedPokeCount > 0) return "pokes";
  if (actionablePlanCount > 0) return "plans";
  return "chats";
}
