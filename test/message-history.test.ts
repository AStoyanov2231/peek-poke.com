import { describe, expect, it } from "vitest";
import { decodeCursor } from "@peekpoke/shared";
import {
  finalizeDescendingMessagePage,
  finalizeDescendingSequenceMessagePage,
  olderThanMessageCursor,
  olderThanSequenceMessageCursor,
} from "@/lib/message-history";

describe("message history pagination", () => {
  it("serves the newest bounded page and cursors from its oldest row", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(101 - index).padStart(12, "0")}`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 101 - index)).toISOString(),
    }));

    const page = finalizeDescendingMessagePage(rows, 100);

    expect(page.items).toHaveLength(100);
    expect(page.items[0]).toEqual(rows[0]);
    expect(page.items.at(-1)).toEqual(rows[99]);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor)).toMatchObject({
      id: rows[99].id,
      sort_value: rows[99].created_at,
    });
  });

  it("uses both timestamp and ID for a stable older-page boundary", () => {
    const cursor = {
      version: "v1" as const,
      sort_value: "2026-08-06T12:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000123",
    };

    expect(olderThanMessageCursor(cursor)).toBe(
      "created_at.lt.2026-08-06T12:00:00.000Z,and(created_at.eq.2026-08-06T12:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000123)",
    );
  });

  it("uses message sequence for room history ordering and cursors", () => {
    const rows = [
      { id: "message-3", sequence: 3 },
      { id: "message-2", sequence: 2 },
      { id: "message-1", sequence: 1 },
    ];

    const page = finalizeDescendingSequenceMessagePage(rows, 2);
    expect(page.items).toEqual(rows.slice(0, 2));
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor)).toMatchObject({ sort_value: "2" });
    expect(olderThanSequenceMessageCursor({
      version: "v1",
      sort_value: "2",
      id: "message-2",
    })).toBe("sequence.lt.2");
    expect(olderThanSequenceMessageCursor({
      version: "v1",
      sort_value: "0",
      id: "message-0",
    })).toBeNull();
  });
});
