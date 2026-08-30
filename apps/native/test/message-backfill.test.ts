import { describe, expect, it } from "vitest";
import {
  messageHintHasGap,
  messageHintNeedsBackfill,
  messageHintSchema,
  mergeNewestFirstMessagePages,
  boundedCursorPath,
} from "@peekpoke/shared";

describe("native message reconnect policy", () => {
  it("accepts only scoped typed hints and detects sequence gaps", () => {
    const hint = messageHintSchema.parse({
      thread_id: "00000000-0000-4000-8000-000000000001",
      action: "sent",
      actor_id: "00000000-0000-4000-8000-000000000002",
      sequence: 12,
    });
    expect(messageHintNeedsBackfill(11, hint.sequence)).toBe(true);
    expect(messageHintHasGap(9, hint.sequence)).toBe(true);
    expect(messageHintSchema.safeParse({
      thread_id: "not-a-thread",
      action: "sent",
    }).success).toBe(false);
  });
});

describe("native message history pages", () => {
  it("requests the next bounded cursor page through the backend API", () => {
    expect(boundedCursorPath("/api/dm/thread%2Fid", "v1.cursor+/=")).toBe(
      "/api/dm/thread%2Fid?limit=100&cursor=v1.cursor%2B%2F%3D",
    );
  });

  it("merges more than 100 messages oldest-to-newest without overlap duplicates", () => {
    const older = Array.from({ length: 30 }, (_, index) => ({ id: `m-${index + 1}` }));
    const latest = Array.from({ length: 100 }, (_, index) => ({ id: `m-${index + 30}` }));

    const merged = mergeNewestFirstMessagePages([
      { messages: latest },
      { messages: older },
    ]);

    expect(merged).toHaveLength(129);
    expect(merged[0]?.id).toBe("m-1");
    expect(merged.at(-1)?.id).toBe("m-129");
    expect(merged.filter((message) => message.id === "m-30")).toHaveLength(1);
  });
});
