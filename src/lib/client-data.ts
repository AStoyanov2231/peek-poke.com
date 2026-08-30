const PRIVATE_PROFILE_FIELDS = new Set([
  "push_tokens",
  "stripe_customer_id",
  "deleted_at",
]);

// Database RPCs that still serialize a profile row are filtered with a public
// allowlist, not only a denylist. A newly added sensitive profile column is
// therefore private by default until it is deliberately reviewed here.
const PUBLIC_PROFILE_FIELDS = new Set([
  "id",
  "username",
  "display_name",
  "bio",
  "avatar_url",
  "cover_image_url",
  "location_text",
  "is_online",
  "last_seen_at",
  "created_at",
  "updated_at",
  "onboarding_completed",
  "roles",
  "friendship_id",
  "account_deleted",
]);

/**
 * Removes operational profile fields from nested RPC payloads before they are
 * returned to web or native clients. Several legacy database functions build
 * JSON with `to_jsonb(profiles.*)`, so keep this server-side boundary even
 * after those functions become service-role-only.
 */
export function stripPrivateProfileFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripPrivateProfileFields) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const isProfileRecord = typeof record.id === "string" && typeof record.username === "string";
  const sanitized: Record<string, unknown> = {};
  if (isProfileRecord && record.deleted_at != null) {
    // Expose only a boolean lifecycle state needed to make retained shared
    // threads read-only. Never expose the deletion timestamp itself.
    sanitized.account_deleted = true;
  }
  for (const [key, nestedValue] of Object.entries(record)) {
    if (PRIVATE_PROFILE_FIELDS.has(key)) continue;
    if (isProfileRecord && !PUBLIC_PROFILE_FIELDS.has(key)) continue;
    sanitized[key] = stripPrivateProfileFields(nestedValue);
  }
  return sanitized as T;
}
