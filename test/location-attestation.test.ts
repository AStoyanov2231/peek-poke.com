import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyLocationAttestation } from "@/lib/location-attestation";

const SECRET = "location-attestation-test-secret-0123456789";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION = { lat: 42.6977, lng: 23.3219 };
const NOW = Date.parse("2026-09-01T12:00:00.000Z");

describe("location attestation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a signed current location for the matching account", () => {
    vi.stubEnv("LOCATION_ATTESTATION_SECRET", SECRET);
    const token = sign({
      user_id: USER_ID,
      ...LOCATION,
      nonce: "nonce-0123456789",
      issued_at: NOW,
    });

    expect(verifyLocationAttestation(token, USER_ID, LOCATION, NOW)).toMatchObject({
      issuedAt: "2026-09-01T12:00:00.000Z",
    });
  });

  it.each([
    ["a different account", USER_ID.replace("1111", "2222"), LOCATION, NOW],
    ["spoofed coordinates", USER_ID, { lat: 0, lng: 0 }, NOW],
    ["a stale token", USER_ID, LOCATION, NOW],
  ])("rejects %s", (_label, userId, coordinates, currentTime) => {
    vi.stubEnv("LOCATION_ATTESTATION_SECRET", SECRET);
    const token = sign({
      user_id: USER_ID,
      ...LOCATION,
      nonce: "nonce-0123456789",
      issued_at: _label === "a stale token" ? NOW - 120_001 : NOW,
    });

    expect(verifyLocationAttestation(token, userId, coordinates, currentTime)).toBeNull();
  });

  it("rejects unsigned and malformed tokens", () => {
    vi.stubEnv("LOCATION_ATTESTATION_SECRET", SECRET);
    expect(verifyLocationAttestation("not-a-token", USER_ID, LOCATION, NOW)).toBeNull();
    expect(verifyLocationAttestation("e30.invalid", USER_ID, LOCATION, NOW)).toBeNull();
  });
});

function sign(payload: Record<string, unknown>) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}
