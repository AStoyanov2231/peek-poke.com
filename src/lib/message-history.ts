import { encodeCursor, type Cursor } from "@peekpoke/shared";

type MessageCursorRow = {
  id: string;
  created_at: string;
};

export function olderThanMessageCursor(cursor: Cursor) {
  return `created_at.lt.${cursor.sort_value},and(created_at.eq.${cursor.sort_value},id.lt.${cursor.id})`;
}

export function finalizeDescendingMessagePage<T extends MessageCursorRow>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const oldest = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && oldest
      ? encodeCursor({ sort_value: oldest.created_at, id: oldest.id })
      : null,
  };
}
