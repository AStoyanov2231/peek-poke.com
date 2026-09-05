import { describe, expect, it } from "vitest";
import {
  MAX_SHARED_GROUP_QR_CONTENT_LENGTH,
  sharedGroupJoinRequestSchema,
  sharedGroupSummarySchema,
  sharedGroupsResponseSchema,
} from "@peekpoke/shared";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-08-14T10:00:00.000Z";
const group = {
  id: GROUP_ID,
  name: "Shared group" as const,
  member_count: 2,
  last_message_at: null,
  last_message_preview: null,
  created_at: createdAt,
  unread_count: 0,
};

function list(groups = [group]) {
  return {
    groups,
    total_unread: groups.reduce((total, item) => total + item.unread_count, 0),
    pagination: { version: "v1" as const, next_cursor: null, has_more: false, limit: 100 },
  };
}

describe("shared QR group contracts", () => {
  it("keeps exact text as the client payload without URL interpretation", () => {
    const content = "  https://coffee.example/table?id=7  ";
    expect(sharedGroupJoinRequestSchema.parse({ qr_content: content }).qr_content).toBe(content);
  });

  it.each([
    ["empty", ""],
    ["oversized", "x".repeat(MAX_SHARED_GROUP_QR_CONTENT_LENGTH + 1)],
    ["NUL", "coffee\u0000table"],
  ])("rejects %s QR text", (_label, qrContent) => {
    expect(() => sharedGroupJoinRequestSchema.parse({ qr_content: qrContent })).toThrow();
  });

  it("rejects duplicate groups and unread totals that could corrupt inbox state", () => {
    expect(() => sharedGroupsResponseSchema.parse(list([group, group]))).toThrow();
    expect(() => sharedGroupsResponseSchema.parse({ ...list(), total_unread: 1 })).toThrow();
    expect(sharedGroupSummarySchema.parse(group)).toEqual(group);
  });
});
