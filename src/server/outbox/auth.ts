import { timingSafeEqual } from "node:crypto";

export function isOutboxRequestAuthorized(
  authorization: string | null,
  configuredSecret: string | undefined,
) {
  if (!configuredSecret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(configuredSecret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
