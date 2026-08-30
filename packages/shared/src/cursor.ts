import { API_VERSION, MAX_CURSOR_BYTES, cursorSchema } from "./contract";

export type Cursor = {
  version: typeof API_VERSION;
  sort_value: string;
  id: string;
};

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new Uint8Array(Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeCursor(cursor: Omit<Cursor, "version">): string {
  return `${API_VERSION}.${encodeBase64Url(JSON.stringify({ v: API_VERSION, s: cursor.sort_value, i: cursor.id }))}`;
}

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value || value.length > MAX_CURSOR_BYTES) return null;
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success || !value.startsWith(`${API_VERSION}.`)) return null;
  try {
    const encoded = value.slice(`${API_VERSION}.`.length);
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as { v?: string; s?: string; i?: string };
    if (payload.v !== API_VERSION || !payload.s || !payload.i) return null;
    return { version: API_VERSION, sort_value: payload.s, id: payload.i };
  } catch {
    return null;
  }
}

export function compareCursor(sortValue: string, id: string, cursor: Cursor) {
  return sortValue > cursor.sort_value || (sortValue === cursor.sort_value && id > cursor.id);
}

export function paginateCursor<T extends { id: string; sort_value: string }>(items: T[], limit: number, cursorValue?: string | null) {
  const cursor = decodeCursor(cursorValue);
  const start = cursor ? items.findIndex((item) => compareCursor(item.sort_value, item.id, cursor)) : 0;
  const offset = start < 0 ? items.length : start;
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;
  return {
    items: page,
    next_cursor: hasMore && page.length > 0
      ? encodeCursor({ sort_value: page[page.length - 1].sort_value, id: page[page.length - 1].id })
      : null,
    has_more: hasMore,
  };
}
