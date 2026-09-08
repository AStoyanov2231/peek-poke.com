import { describe, expect, it } from "vitest";
import { availabilityDurationForEnd } from "@peekpoke/shared";

describe("availability deadline", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  it("enforces the same minimum and maximum as the server", () => {
    expect(availabilityDurationForEnd("2026-09-08T12:15:00Z", now)).toBe(15);
    expect(availabilityDurationForEnd("2026-09-09T00:00:00Z", now)).toBe(720);
    expect(availabilityDurationForEnd("2026-09-08T12:14:00Z", now)).toBeNull();
    expect(availabilityDurationForEnd("2026-09-09T00:01:00Z", now)).toBeNull();
  });
  it("rejects invalid and past deadlines", () => {
    expect(availabilityDurationForEnd("invalid", now)).toBeNull();
    expect(availabilityDurationForEnd("2026-09-08T11:00:00Z", now)).toBeNull();
  });
  it("resolves an explicit timezone offset before computing elapsed minutes", () => {
    expect(availabilityDurationForEnd("2026-09-08T16:00:00+03:00", now)).toBe(60);
  });
});
