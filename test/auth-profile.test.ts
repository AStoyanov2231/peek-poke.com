import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  ensureAuthProfile,
  initialDisplayNameFor,
  isTemporaryUsername,
  type AuthProfileRepository,
} from "@/lib/auth-profile";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    app_metadata: { provider: "google" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-07T10:00:00.000Z",
    ...overrides,
  };
}

function profile(
  id = USER_ID,
  onboardingCompleted = false,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    onboarding_completed: onboardingCompleted,
    deleted_at: null,
    auth_user_id: id,
    created: false,
    user_role_assigned: true,
    ...overrides,
  };
}

describe("authenticated profile bootstrap", () => {
  it("repairs an existing active profile with exactly one default role", async () => {
    const roles = new Set<string>();
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async () => {
        roles.add("user");
        return { data: profile(USER_ID, true), error: null };
      }),
    };

    await expect(ensureAuthProfile(user(), repository)).resolves.toEqual({
      status: "ready",
      created: false,
      profile: { id: USER_ID, onboarding_completed: true },
    });
    expect(roles).toEqual(new Set(["user"]));
    expect(repository.ensure).toHaveBeenCalledOnce();
  });

  it("creates one profile and one default role", async () => {
    const profiles = new Set<string>();
    const roles = new Set<string>();
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async (input) => {
        profiles.add(input.authUserId);
        roles.add(`${input.authUserId}:user`);
        return {
          data: profile(input.authUserId, false, { created: true }),
          error: null,
        };
      }),
    };

    await expect(ensureAuthProfile(user(), repository)).resolves.toMatchObject({
      status: "ready",
      created: true,
    });
    expect(profiles).toEqual(new Set([USER_ID]));
    expect(roles).toEqual(new Set([`${USER_ID}:user`]));
  });

  it("coalesces concurrent duplicate ensures to one profile and one role", async () => {
    const profiles = new Set<string>();
    const roles = new Set<string>();
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async (input) => {
        if (!profiles.has(input.authUserId)) {
          await Promise.resolve();
          if (profiles.has(input.authUserId)) {
            return { data: null, error: { code: "23505" } };
          }
          profiles.add(input.authUserId);
          roles.add(`${input.authUserId}:user`);
          return {
            data: profile(input.authUserId, false, { created: true }),
            error: null,
          };
        }
        roles.add(`${input.authUserId}:user`);
        return {
          data: profile(input.authUserId),
          error: null,
        };
      }),
    };

    const results = await Promise.all([
      ensureAuthProfile(user(), repository),
      ensureAuthProfile(user(), repository),
    ]);

    expect(results).toContainEqual({
      status: "ready",
      created: true,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    expect(results).toContainEqual({
      status: "ready",
      created: false,
      profile: { id: USER_ID, onboarding_completed: false },
    });
    expect(profiles.size).toBe(1);
    expect(roles.size).toBe(1);
    expect(repository.ensure).toHaveBeenCalledTimes(3);
  });

  it("uses a bounded deterministic alternate when another user owns the first username", async () => {
    const usernames: string[] = [];
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async (input) => {
        usernames.push(input.username);
        return usernames.length === 1
          ? { data: null, error: { code: "23505" } }
          : { data: profile(input.authUserId, false, { created: true }), error: null };
      }),
    };

    await expect(ensureAuthProfile(user(), repository)).resolves.toMatchObject({
      status: "ready",
      created: true,
    });
    expect(usernames).toHaveLength(2);
    expect(new Set(usernames).size).toBe(2);
    expect(usernames.every((username) => username.length === 20 && isTemporaryUsername(username))).toBe(true);
  });

  it("derives public defaults without requiring email or trusted metadata", async () => {
    const writes: unknown[] = [];
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async (input) => {
        writes.push(input);
        return {
          data: profile(input.authUserId, false, { created: true }),
          error: null,
        };
      }),
    };

    await ensureAuthProfile(user({ email: undefined, user_metadata: {} }), repository);
    expect(writes).toEqual([expect.objectContaining({
      authUserId: USER_ID,
      displayName: null,
    })]);
    expect(initialDisplayNameFor(user({
      user_metadata: { full_name: "  Ada\u0000\n Lovelace  " },
    }))).toBe("Ada Lovelace");
    expect(initialDisplayNameFor(user({
      user_metadata: { full_name: `  E\u0301lodie ${"😀".repeat(60)}  ` },
    }))).toBe(`Élodie ${"😀".repeat(43)}`);
    expect(initialDisplayNameFor(user({
      user_metadata: { full_name: "Ada\u202eLovelace" },
    }))).toBeNull();
  });

  it("fails closed when the atomic operation rolls back a profile after role assignment fails", async () => {
    const profiles = new Set<string>();
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async (input) => {
        profiles.add(input.authUserId);
        profiles.delete(input.authUserId);
        return { data: null, error: { code: "P0001", message: "role missing" } };
      }),
    };

    await expect(ensureAuthProfile(user(), repository)).resolves.toMatchObject({ status: "failed" });
    expect(profiles.size).toBe(0);
    expect(repository.ensure).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing role proof", profile(USER_ID, false, { user_role_assigned: false })],
    ["extra output", { ...profile(), internal: true }],
    ["missing output", (() => {
      const { created: _created, ...row } = profile();
      return row;
    })()],
  ])("rejects an atomic result with %s", async (_label, row) => {
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async () => ({ data: row, error: null })),
    };

    await expect(ensureAuthProfile(user(), repository)).resolves.toMatchObject({ status: "failed" });
  });

  it.each([
    ["soft-deleted profile", user(), profile(USER_ID, false, { deleted_at: "2026-08-07T10:00:00.000Z", user_role_assigned: false })],
    ["detached profile", user(), profile(USER_ID, false, { auth_user_id: null, user_role_assigned: false })],
    ["deleted auth user", user({ deleted_at: "2026-08-07T10:00:00.000Z" }), null],
    ["banned auth user", { ...user(), banned_until: "2099-01-01T00:00:00.000Z" } as User, null],
  ])("rejects a %s without creating or restoring data", async (_label, authUser, result) => {
    const repository: AuthProfileRepository = {
      ensure: vi.fn(async () => ({ data: result, error: null })),
    };

    await expect(ensureAuthProfile(authUser, repository)).resolves.toEqual({ status: "disabled" });
    if (result === null) {
      expect(repository.ensure).not.toHaveBeenCalled();
    } else {
      expect(repository.ensure).toHaveBeenCalledOnce();
    }
  });
});
