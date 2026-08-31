import { describe, expect, it } from "vitest";
import {
  createOwnerProfileUpdateCoordinator,
  displayNameInputSchema,
  displayNameLength,
  displayNameSchema,
  ownerProfilePatchRequestSchema,
  ownerProfileUpdateResponseSchema,
} from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-07T10:00:00.000Z";

const profile = {
  id: USER_ID,
  username: "owner",
  display_name: "Élodie 🌈",
  bio: "Hello",
  avatar_url: null,
  cover_image_url: null,
  is_online: true,
  last_seen_at: timestamp,
  created_at: timestamp,
  onboarding_completed: true,
  roles: ["user" as const],
};

describe("owner display-name contract", () => {
  it("trims Unicode whitespace and normalizes valid Unicode to NFC", () => {
    const parsed = ownerProfilePatchRequestSchema.parse({
      display_name: "\u00a0 E\u0301lodie 🌈 \u00a0",
    });

    expect(parsed).toEqual({ display_name: "Élodie 🌈" });
    expect(displayNameLength(parsed.display_name!)).toBe(8);
  });

  it("counts Unicode code points consistently instead of UTF-16 code units", () => {
    expect(displayNameInputSchema.parse("😀".repeat(50))).toBe("😀".repeat(50));
    expect(() => displayNameInputSchema.parse("😀".repeat(51))).toThrow(/50 characters or less/);
  });

  it.each([
    ["blank", " \u00a0 "],
    ["line break", "Ada\nLovelace"],
    ["zero width", "Ada\u200bLovelace"],
    ["Arabic bidi mark", "Ada\u061cLovelace"],
    ["left-to-right bidi mark", "Ada\u200eLovelace"],
    ["right-to-left bidi mark", "Ada\u200fLovelace"],
    ["bidi override", "Ada\u202eLovelace"],
  ])("rejects unsafe %s input", (_label, value) => {
    expect(ownerProfilePatchRequestSchema.safeParse({ display_name: value }).success).toBe(false);
  });

  it("rejects empty and extra-field patches", () => {
    expect(ownerProfilePatchRequestSchema.safeParse({}).success).toBe(false);
    expect(ownerProfilePatchRequestSchema.safeParse({ display_name: "Ada", id: USER_ID }).success).toBe(false);
    expect(ownerProfilePatchRequestSchema.safeParse({ location_text: "Sofia" }).success).toBe(false);
  });

  it("requires successful responses to be non-null, exact, and already canonical", () => {
    expect(ownerProfileUpdateResponseSchema.parse({ profile })).toEqual({ profile });
    expect(ownerProfileUpdateResponseSchema.safeParse({ profile: null }).success).toBe(false);
    expect(ownerProfileUpdateResponseSchema.safeParse({ profile: { ...profile, secret: "x" } }).success).toBe(false);
    expect(ownerProfileUpdateResponseSchema.safeParse({
      profile: { ...profile, display_name: " E\u0301lodie 🌈 " },
    }).success).toBe(false);
    expect(displayNameSchema.safeParse("Ada\nLovelace").success).toBe(false);
  });
});

describe("owner profile update attempt fencing", () => {
  it("aborts cancellation and prevents a previous account callback from committing", () => {
    const coordinator = createOwnerProfileUpdateCoordinator();
    const first = coordinator.begin("account-a");
    const second = coordinator.begin("account-b");

    expect(first.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(first, "account-a")).toBe(false);
    expect(coordinator.isCurrent(second, "account-a")).toBe(false);
    expect(coordinator.isCurrent(second, "account-b")).toBe(true);

    coordinator.cancel();
    expect(second.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(second, "account-b")).toBe(false);
  });
});
