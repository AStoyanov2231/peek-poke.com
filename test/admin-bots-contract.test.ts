import { describe, expect, it } from "vitest";
import {
  MAX_ADMIN_BOTS,
  adminBotCollectRequestSchema,
  adminBotCollectResultSchema,
  adminBotCollectionWasApplied,
  adminBotListQuerySchema,
  adminBotListResponseSchema,
  normalizeAdminBotListQuery,
} from "@peekpoke/shared";

const BOT_ID = "11111111-1111-4111-8111-111111111111";

describe("admin bot contracts", () => {
  it("normalizes one exact coordinate pair and rejects duplicate or unknown query parameters", () => {
    expect(adminBotListQuerySchema.parse(normalizeAdminBotListQuery(
      new URLSearchParams("lat=42.5&lng=23.25"),
    ))).toEqual({ lat: 42.5, lng: 23.25 });
    expect(adminBotListQuerySchema.safeParse(normalizeAdminBotListQuery(
      new URLSearchParams("lat=42&lat=43&lng=23"),
    )).success).toBe(false);
    expect(adminBotListQuerySchema.safeParse(normalizeAdminBotListQuery(
      new URLSearchParams("lat=42&lng=23&radius=5"),
    )).success).toBe(false);
  });

  it("requires the exact collect body", () => {
    const valid = { id: BOT_ID, lat: 42.5, lng: 23.25 };
    expect(adminBotCollectRequestSchema.parse(valid)).toEqual(valid);
    expect(adminBotCollectRequestSchema.safeParse({ ...valid, radius: 5 }).success).toBe(false);
    expect(adminBotCollectRequestSchema.safeParse({ id: BOT_ID, lat: 42.5 }).success).toBe(false);
  });

  it("bounds strict bot rows and rejects duplicate IDs", () => {
    const bots = Array.from({ length: MAX_ADMIN_BOTS }, (_, index) => ({
      id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
      lat: 42.5,
      lng: 23.25,
    }));
    expect(adminBotListResponseSchema.safeParse(bots).success).toBe(true);
    expect(adminBotListResponseSchema.safeParse([...bots, bots[0]]).success).toBe(false);
    expect(adminBotListResponseSchema.safeParse([{ ...bots[0], raw: true }]).success).toBe(false);
  });

  it.each([
    [{ ok: true, balance: 3 }, true],
    [{ ok: false, reason: "already_collected", balance: 3 }, true],
    [{ ok: false, reason: "at_capacity", balance: 5 }, false],
    [{ ok: false, reason: "location_stale" }, false],
  ])("validates and classifies collect outcome %#", (outcome, applied) => {
    const result = adminBotCollectResultSchema.parse(outcome);
    expect(adminBotCollectionWasApplied(result)).toBe(applied);
  });

  it.each([
    { ok: true, balance: 3, raw: true },
    { ok: false, reason: "not_found", balance: 0 },
    { ok: false, reason: "at_capacity", balance: 6 },
    { ok: false, reason: "database_surprise" },
    { ok: false },
  ])("rejects malformed outcome %#", (outcome) => {
    expect(adminBotCollectResultSchema.safeParse(outcome).success).toBe(false);
  });
});
