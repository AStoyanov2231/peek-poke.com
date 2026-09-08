import { describe, expect, it } from "vitest";
import type { PokeInboxItem } from "@peekpoke/shared";
import {
  pokeActivityLabel,
  pokeExpiryLabel,
  pokeStateLabel,
} from "@/lib/poke-presentation";

const NOW = Date.parse("2026-09-08T10:00:00.000Z");

const pending = {
  activity: "coffee",
  customLabel: null,
  status: "pending",
  expiresAt: new Date(NOW + 60 * 60_000).toISOString(),
} satisfies Pick<PokeInboxItem, "activity" | "customLabel" | "status" | "expiresAt">;

describe("native Poke presentation", () => {
  it("shows a readable activity and forward-looking expiry for a received Poke", () => {
    expect(pokeActivityLabel(pending)).toBe("Coffee");
    const label = pokeExpiryLabel(pending.expiresAt, NOW);
    expect(label).toMatch(/^Expires /);
    expect(pokeExpiryLabel(pending.expiresAt, NOW + 30 * 60_000)).toBe(label);
    expect(pokeExpiryLabel(pending.expiresAt, NOW + 60 * 60_000)).toBe("Expired");
  });

  it("does not leave terminal or expired Pokes actionable-looking", () => {
    expect(pokeStateLabel({ ...pending, expiresAt: new Date(NOW - 1).toISOString() }, NOW)).toBe("Expired");
    expect(pokeStateLabel({ ...pending, status: "accepted" }, NOW)).toBe("Accepted");
    expect(pokeStateLabel({ ...pending, status: "later" }, NOW)).toBe("Later");
    expect(pokeStateLabel({ ...pending, status: "declined" }, NOW)).toBe("Declined");
  });
});
