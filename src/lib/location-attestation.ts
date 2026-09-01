import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const attestationPayloadSchema = z.strictObject({
  user_id: z.uuid(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  nonce: z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  issued_at: z.number().int(),
});

const MAX_ATTESTATION_AGE_MS = 120_000;
const MAX_ATTESTATION_FUTURE_MS = 30_000;

function decode(value: string) {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function verifyLocationAttestation(
  token: string | null,
  userId: string,
  coordinates: { lat: number; lng: number },
  now = Date.now(),
) {
  const secret = process.env.LOCATION_ATTESTATION_SECRET;
  if (!secret || secret.length < 32 || !token) return null;

  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature || token.split(".").length !== 2) return null;

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) return null;

  const rawPayload = decode(encodedPayload);
  if (!rawPayload) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }
  const parsed = attestationPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  if (
    parsed.data.user_id !== userId
    || parsed.data.lat !== coordinates.lat
    || parsed.data.lng !== coordinates.lng
    || now - parsed.data.issued_at > MAX_ATTESTATION_AGE_MS
    || parsed.data.issued_at - now > MAX_ATTESTATION_FUTURE_MS
  ) return null;

  return {
    nonceHash: createHash("sha256").update(parsed.data.nonce).digest("hex"),
    issuedAt: new Date(parsed.data.issued_at).toISOString(),
  };
}
