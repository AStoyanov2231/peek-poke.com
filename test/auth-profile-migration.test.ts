import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807120448_auth_profile_bootstrap.sql",
  "utf8",
);

describe("auth profile bootstrap migration", () => {
  it("links only active Auth-backed profiles without forcing deleted personas into Auth", () => {
    expect(migration).toContain("add column if not exists auth_user_id uuid");
    expect(migration).toMatch(/where profile\.deleted_at is null\s+and profile\.auth_user_id is null\s+and exists \(\s+select 1\s+from auth\.users auth_user\s+where auth_user\.id = profile\.id/s);
    expect(migration).toContain("profiles_active_auth_link_check");
    expect(migration).toContain("check (deleted_at is not null or auth_user_id is not null)");
    expect(migration).toContain("profiles_auth_user_id_unique");
    expect(migration).toContain("drop trigger if exists on_auth_user_created on auth.users");
    expect(migration).not.toMatch(/create\s+trigger\s+on_auth_user_created/i);
  });

  it("backfills exactly the default role for active Auth-linked profiles", () => {
    expect(migration).toMatch(/insert into public\.user_roles \(user_id, role_id\)\s+select profile\.id, role\.id\s+from public\.profiles profile\s+cross join public\.roles role\s+where profile\.deleted_at is null\s+and profile\.auth_user_id = profile\.id\s+and role\.name = 'user'\s+on conflict \(user_id, role_id\) do nothing/s);
  });

  it("creates an atomic profile-and-role function that also repairs existing profiles", () => {
    const selectExisting = migration.indexOf("select profile.*\n  into ensured_profile");
    const insertProfile = migration.indexOf("insert into public.profiles (");
    const insertRole = migration.lastIndexOf("insert into public.user_roles (user_id, role_id)");
    const successResult = migration.indexOf("profile_created,\n    true;");

    expect(migration).toContain("ensure_auth_profile_with_default_role");
    expect(selectExisting).toBeGreaterThan(-1);
    expect(insertProfile).toBeGreaterThan(selectExisting);
    expect(insertRole).toBeGreaterThan(insertProfile);
    expect(successResult).toBeGreaterThan(insertRole);
    expect(migration).toMatch(/on conflict \(user_id, role_id\) do nothing;/g);
    expect(migration).toContain("raise exception 'Default user role is missing'");
    expect(migration.indexOf("raise exception 'Default user role is missing'")).toBeGreaterThan(insertProfile);
  });

  it("does not assign roles to bots, detached profiles, or deleted profiles", () => {
    expect(migration).toMatch(/where profile\.deleted_at is null\s+and profile\.auth_user_id = profile\.id\s+and role\.name = 'user'/s);
    expect(migration).toMatch(/from auth\.users auth_user\s+where auth_user\.id = p_auth_user_id\s+and auth_user\.deleted_at is null/s);
    expect(migration).toMatch(/ensured_profile\.deleted_at is not null\s+or ensured_profile\.auth_user_id is distinct from p_auth_user_id/s);
  });

  it("hardens the privileged function and exposes it only to service_role", () => {
    expect(migration).toMatch(/language plpgsql\s+security definer\s+set search_path = ''/s);
    expect(migration).toMatch(/revoke execute on function public\.ensure_auth_profile_with_default_role\(uuid, text, text\)\s+from public, anon, authenticated;/s);
    expect(migration).toMatch(/grant execute on function public\.ensure_auth_profile_with_default_role\(uuid, text, text\)\s+to service_role;/s);
  });
});
