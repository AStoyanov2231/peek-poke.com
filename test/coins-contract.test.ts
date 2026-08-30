import { describe, expect, it } from "vitest";
import {
  coinsResponseSchema,
  endpointContracts,
  meetingResponseSchema,
} from "@peekpoke/shared";

describe("coins shared contracts", () => {
  it("accepts the exact balance and meeting outcomes", () => {
    expect(coinsResponseSchema.parse({ balance: 0 })).toEqual({ balance: 0 });
    expect(meetingResponseSchema.parse({
      success: true,
      awarded: false,
      already_met: true,
      balance: null,
    })).toEqual({ success: true, awarded: false, already_met: true, balance: null });
    expect(meetingResponseSchema.parse({
      success: true,
      awarded: true,
      already_met: false,
      balance: 5,
    })).toEqual({ success: true, awarded: true, already_met: false, balance: 5 });
    expect(meetingResponseSchema.parse({
      success: true,
      awarded: false,
      already_met: false,
      balance: 5,
    })).toEqual({ success: true, awarded: false, already_met: false, balance: 5 });
  });

  it.each([
    ["extra", { balance: 1, raw: true }],
    ["missing", {}],
    ["type", { balance: "1" }],
    ["semantic", { balance: -1 }],
  ])("rejects %s malformed balance DTOs", (_kind, payload) => {
    expect(coinsResponseSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    ["extra", { success: true, awarded: true, already_met: false, balance: 1, raw: true }],
    ["missing", { success: true, awarded: true, already_met: false }],
    ["type", { success: true, awarded: "yes", already_met: false, balance: 1 }],
    ["semantic", { success: true, awarded: true, already_met: true, balance: 1 }],
  ])("rejects %s malformed meeting DTOs", (_kind, payload) => {
    expect(meetingResponseSchema.safeParse(payload).success).toBe(false);
  });

  it("registers the exact transport contracts", () => {
    expect(endpointContracts.coins).toMatchObject({ method: "GET", path: "/api/coins" });
    expect(endpointContracts.meeting).toMatchObject({ method: "POST", path: "/api/coins/meeting" });
  });
});
