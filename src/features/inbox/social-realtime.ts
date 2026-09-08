import { socialChangedHintSchema, type SocialChangedHint } from "@peekpoke/shared";

export type { SocialChangedHint };

/** Realtime payloads are untrusted hints and never directly modify cached state. */
export function parseSocialChangedHint(value: unknown): SocialChangedHint | null {
  const payload = value && typeof value === "object" ? (value as { payload?: unknown }).payload : null;
  const parsed = socialChangedHintSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
