import { describe, expect, it } from "vitest";
import { hasPlanStarted } from "@/data/plan-detail-time";

describe("Plan detail start boundary", () => {
  it("treats the Plan as started at its exact scheduled time", () => {
    const start = "2027-01-15T10:00:00.000Z";
    const startMs = new Date(start).getTime();

    expect(hasPlanStarted(start, startMs - 1)).toBe(false);
    expect(hasPlanStarted(start, startMs)).toBe(true);
  });
});
