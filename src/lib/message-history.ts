import { encodeCursor, type Cursor } from "@peekpoke/shared";

type MessageCursorRow = {
  id: string;
  created_at: string;
};

type SequenceMessageCursorRow = {
  id: string;
  sequence: number;
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

export function olderThanSequenceMessageCursor(cursor: Cursor) {
  if (!/^[1-9][0-9]*$/.test(cursor.sort_value)) return null;
  const sequence = Number(cursor.sort_value);
  if (!Number.isSafeInteger(sequence)) return null;
  return `sequence.lt.${cursor.sort_value}`;
}

export function finalizeDescendingSequenceMessagePage<T extends SequenceMessageCursorRow>(
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
      ? encodeCursor({ sort_value: String(oldest.sequence), id: oldest.id })
      : null,
  };
}
