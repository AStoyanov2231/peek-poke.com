import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isValidUUID } from "@/lib/validation";

const TOKEN_VERSION = "v1";
const INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;

function signingKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for invite signing");
  }

  // Key separation prevents invite tokens from using the service-role JWT as
  // an HMAC key directly while avoiding another production secret dependency.
  return createHash("sha256")
    .update("peek-poke:invite-link:v1\0", "utf8")
    .update(serviceRoleKey, "utf8")
    .digest();
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(payload, "utf8").digest("base64url");
}

export function createInviteToken(inviterId: string, now = Date.now()) {
  if (!isValidUUID(inviterId)) throw new Error("Invalid inviter ID");
  const expiresAt = Math.floor(now / 1000) + INVITE_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${inviterId}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyInviteToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [version, inviterId, expiresAtRaw, providedSignature] = parts;
  if (version !== TOKEN_VERSION || !isValidUUID(inviterId)) return null;
  if (!/^\d{10}$/.test(expiresAtRaw)) return null;

  const expiresAt = Number(expiresAtRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt < nowSeconds - CLOCK_SKEW_SECONDS) return null;
  if (expiresAt > nowSeconds + INVITE_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null;

  const payload = `${version}.${inviterId}.${expiresAtRaw}`;
  const expected = Buffer.from(signature(payload), "utf8");
  const provided = Buffer.from(providedSignature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  return inviterId;
}
