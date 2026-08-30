import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import {
  canonicalizeDisplayName,
  displayNameSchema,
  MAX_DISPLAY_NAME_LENGTH,
} from "@peekpoke/shared";
import { createServiceClient } from "@/lib/supabase/server";

const TEMPORARY_USERNAME_PATTERN = /^user_(?:[a-f0-9]{8}|[a-f0-9]{15})$/i;
const MAX_USERNAME_ATTEMPTS = 4;
const ATOMIC_RESULT_KEYS = [
  "auth_user_id",
  "created",
  "deleted_at",
  "id",
  "onboarding_completed",
  "user_role_assigned",
] as const;

type ProfileRow = {
  id: string;
  onboarding_completed: boolean | null;
  deleted_at: string | null;
  auth_user_id?: string | null;
  created: boolean;
  user_role_assigned: boolean;
};

type RepositoryResult = {
  data: unknown;
  error: unknown;
};

export type AuthProfileRepository = {
  ensure: (input: {
    authUserId: string;
    username: string;
    displayName: string | null;
  }) => Promise<RepositoryResult>;
};

export type EnsureAuthProfileResult =
  | {
      status: "ready";
      created: boolean;
      profile: { id: string; onboarding_completed: boolean };
    }
  | { status: "disabled" }
  | { status: "failed"; cause: unknown };

export function isTemporaryUsername(username: string) {
  return TEMPORARY_USERNAME_PATTERN.test(username);
}

export function initialUsernameFor(user: User) {
  // Fifteen UUID hex characters keep the temporary username within the
  // 20-character product limit while avoiding the collision risk of 8 chars.
  // Never trust caller-controlled Auth metadata to claim a public username;
  // username selection happens through the validated onboarding endpoint.
  return `user_${user.id.replaceAll("-", "").slice(0, 15)}`;
}

export function initialDisplayNameFor(user: User) {
  const candidate = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof candidate !== "string") return null;
  const collapsed = candidate
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const value = Array.from(canonicalizeDisplayName(collapsed))
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
    .join("")
    .trim();
  const parsed = displayNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function createAuthProfileRepository(): AuthProfileRepository {
  const serviceClient = createServiceClient();
  return {
    async ensure(input) {
      return serviceClient
        .rpc("ensure_auth_profile_with_default_role", {
          p_auth_user_id: input.authUserId,
          p_username: input.username,
          p_display_name: input.displayName,
        })
        .single();
    },
  };
}

function profileResult(row: unknown, userId: string): EnsureAuthProfileResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { status: "failed", cause: new Error("Profile bootstrap returned an invalid row") };
  }

  const profile = row as Partial<ProfileRow>;
  const keys = Object.keys(profile).sort();
  if (
    keys.length !== ATOMIC_RESULT_KEYS.length ||
    !ATOMIC_RESULT_KEYS.every((key, index) => key === keys[index])
  ) {
    return { status: "failed", cause: new Error("Profile bootstrap returned an invalid shape") };
  }
  if (profile.id !== userId) {
    return { status: "failed", cause: new Error("Profile bootstrap returned the wrong identity") };
  }
  if (typeof profile.created !== "boolean" || typeof profile.user_role_assigned !== "boolean") {
    return { status: "failed", cause: new Error("Profile bootstrap returned invalid status") };
  }
  if (
    profile.deleted_at !== null &&
    typeof profile.deleted_at !== "string"
  ) {
    return { status: "failed", cause: new Error("Profile bootstrap returned invalid deletion state") };
  }
  if (
    profile.auth_user_id !== null &&
    typeof profile.auth_user_id !== "string"
  ) {
    return { status: "failed", cause: new Error("Profile bootstrap returned invalid Auth linkage") };
  }
  if (profile.deleted_at !== null) return { status: "disabled" };
  if (profile.auth_user_id !== userId) return { status: "disabled" };
  if (
    profile.onboarding_completed !== true &&
    profile.onboarding_completed !== false &&
    profile.onboarding_completed !== null
  ) {
    return { status: "failed", cause: new Error("Profile bootstrap returned invalid onboarding state") };
  }
  if (!profile.user_role_assigned) {
    return { status: "failed", cause: new Error("Profile bootstrap did not assign the default role") };
  }

  return {
    status: "ready",
    created: profile.created,
    profile: {
      id: userId,
      onboarding_completed: profile.onboarding_completed === true,
    },
  };
}

function temporaryUsernameForAttempt(user: User, attempt: number) {
  if (attempt === 0) return initialUsernameFor(user);
  const suffix = createHash("sha256")
    .update(`${user.id}:${attempt}`)
    .digest("hex")
    .slice(0, 15);
  return `user_${suffix}`;
}

function conflict(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "23505";
}

export function isDisabledAuthUser(user: User, now = Date.now()) {
  if (typeof user.deleted_at === "string" && user.deleted_at.length > 0) return true;

  const bannedUntil = (user as User & { banned_until?: unknown }).banned_until;
  if (typeof bannedUntil !== "string" || bannedUntil.length === 0) return false;
  const timestamp = Date.parse(bannedUntil);
  return !Number.isFinite(timestamp) || timestamp > now;
}

export async function ensureAuthProfile(
  user: User,
  repository?: AuthProfileRepository,
): Promise<EnsureAuthProfileResult> {
  if (isDisabledAuthUser(user)) return { status: "disabled" };
  const profiles = repository ?? createAuthProfileRepository();

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt += 1) {
    const ensured = await profiles.ensure({
      authUserId: user.id,
      username: temporaryUsernameForAttempt(user, attempt),
      displayName: initialDisplayNameFor(user),
    });

    if (!ensured.error && ensured.data) {
      return profileResult(ensured.data, user.id);
    }
    if (!conflict(ensured.error)) {
      return {
        status: "failed",
        cause: ensured.error ?? new Error("Profile bootstrap returned no row"),
      };
    }
  }

  return { status: "failed", cause: new Error("Temporary username allocation failed") };
}
