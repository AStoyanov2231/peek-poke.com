import { describe, expect, it } from "vitest";
import {
  availabilityUpsertRequestSchema,
  pokeCreateRequestSchema,
  pokeResponseSchema,
} from "../packages/shared/src/social";

const NOW = "2026-09-08T10:00:00.000Z";
const SENDER = "11111111-1111-4111-8111-111111111111";
const RECIPIENT = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";

describe("social contracts", () => {
  it("requires and bounds custom activity labels", () => {
    expect(availabilityUpsertRequestSchema.safeParse({ activity: "custom", customLabel: null, durationMinutes: 60 }).success).toBe(false);
    expect(availabilityUpsertRequestSchema.safeParse({ activity: "coffee", customLabel: "Coffee", durationMinutes: 60 }).success).toBe(false);
    expect(availabilityUpsertRequestSchema.parse({ activity: "custom", customLabel: "Board games", durationMinutes: 60 })).toEqual({ activity: "custom", customLabel: "Board games", durationMinutes: 60 });
  });

  it("does not permit ambiguous poke payloads", () => {
    expect(pokeCreateRequestSchema.safeParse({ recipientId: RECIPIENT, activity: "food", customLabel: null, raw: true }).success).toBe(false);
    expect(pokeCreateRequestSchema.safeParse({ recipientId: RECIPIENT, activity: "custom", customLabel: "x".repeat(49) }).success).toBe(false);
    expect(pokeCreateRequestSchema.parse({ recipientId: RECIPIENT, activity: "coffee", customLabel: null })).toMatchObject({ note: null });
  });

  it("requires a returned thread for an accepted poke", () => {
    const poke = {
      id: "44444444-4444-4444-8444-444444444444", senderId: SENDER, recipientId: RECIPIENT,
      activity: "coffee", customLabel: null, note: null, status: "accepted", expiresAt: NOW,
      createdAt: NOW, respondedAt: NOW, threadId: THREAD,
    };
    expect(pokeResponseSchema.safeParse({ poke, replayed: false }).success).toBe(false);
    expect(pokeResponseSchema.parse({ poke, threadId: THREAD, replayed: false })).toMatchObject({ threadId: THREAD });
  });

  it("keeps an optional Poke note valid through native serialization and server validation", () => {
    const request = { recipientId: RECIPIENT, activity: "coffee", customLabel: null, note: null };
    const serialized = JSON.parse(JSON.stringify(pokeCreateRequestSchema.parse(request)));
    expect(pokeCreateRequestSchema.parse(serialized)).toEqual(request);
    expect(pokeCreateRequestSchema.safeParse({ ...request, note: "  " }).success).toBe(false);
    expect(pokeCreateRequestSchema.safeParse({ ...request, note: "x".repeat(281) }).success).toBe(false);
  });
});
