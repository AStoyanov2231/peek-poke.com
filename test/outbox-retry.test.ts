import { describe, expect, it } from "vitest";
import {
  OUTBOX_MAX_ATTEMPTS,
  outboxRetryDecision,
  safeOutboxError,
} from "@/server/outbox/retry";

describe("outbox retry policy", () => {
  it("uses bounded exponential backoff with deterministic jitter", () => {
    const now = new Date("2026-07-30T00:00:00.000Z");
    const first = outboxRetryDecision(1, now, () => 0);
    const fourth = outboxRetryDecision(4, now, () => 0);

    expect(first).toEqual({
      dead: false,
      availableAt: new Date("2026-07-30T00:00:01.000Z"),
    });
    expect(fourth).toEqual({
      dead: false,
      availableAt: new Date("2026-07-30T00:00:08.000Z"),
    });
  });

  it("dead-letters an exhausted event without another delay", () => {
    const now = new Date("2026-07-30T00:00:00.000Z");
    expect(outboxRetryDecision(OUTBOX_MAX_ATTEMPTS, now, () => 1)).toEqual({
      dead: true,
      availableAt: now,
    });
  });

  it("sanitizes provider errors before persistence", () => {
    expect(safeOutboxError(new Error("provider\nsecret detail"))).toBe(
      "provider secret detail",
    );
  });
});
