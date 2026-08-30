export function mergeNewestFirstMessagePages<T extends { id: string }>(
  pages: readonly { messages: readonly T[] }[],
) {
  const seen = new Set<string>();
  return [...pages].reverse().flatMap((page) => page.messages).filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

export function boundedCursorPath(
  path: string,
  cursor: string | null,
  limit = 100,
) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query}`;
}
