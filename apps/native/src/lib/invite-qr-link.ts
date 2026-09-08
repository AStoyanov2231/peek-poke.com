import { inviteTokenSchema } from "@peekpoke/shared";

const trustedInviteOrigins = new Set([
  "https://www.peek-poke.com",
  "https://peek-poke.com",
]);

/**
 * Recognizes only the signed invite URLs that Peek & Poke itself issues.
 * A null result intentionally leaves QR content on the Circle-join path.
 */
export function inviteTokenFromQrContent(content: string): string | null {
  try {
    const url = new URL(content);
    const match = /^\/invite\/([^/]+)$/.exec(url.pathname);
    if (!trustedInviteOrigins.has(url.origin) || !match || !inviteTokenSchema.safeParse(match[1]).success) {
      return null;
    }
    return match[1];
  } catch {
    return null;
  }
}

/** Keeps only a signed invite token through native auth and admission routes. */
export function inviteTokenForReturn(value: unknown): string | undefined {
  return typeof value === "string" && inviteTokenSchema.safeParse(value).success
    ? value
    : undefined;
}
