import { readFileSync } from "node:fs";
import { parse, parsePlPgSQL } from "@libpg-query/parser";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808082615_account_erasure_storage_objects.sql",
  "utf8",
).toLowerCase();
const pgTap = readFileSync(
  "supabase/tests/account_erasure_storage_objects.test.sql",
  "utf8",
).toLowerCase();

describe("account erasure Storage snapshot migration", () => {
  it("parses the migration, PL/pgSQL bodies, and pgTAP fixture with PostgreSQL 17", async () => {
    const [sql, plpgsql, fixture] = await Promise.all([
      parse(migration),
      parsePlPgSQL(migration),
      parse(pgTap),
    ]);

    expect(Math.floor(sql.version / 10_000)).toBe(17);
    expect(plpgsql.plpgsql_funcs).toHaveLength(4);
    expect(Math.floor(fixture.version / 10_000)).toBe(17);
    expect(pgTap).toContain("select plan(18)");
  });

  it("defines a service-only hardened snapshot RPC on a clean migration train", () => {
    expect(migration).toContain("create or replace function public.account_erasure_storage_objects");
    expect(migration).toMatch(/language plpgsql\s+security definer\s+set search_path = ''/);
    expect(migration).toMatch(/revoke all on function public\.account_erasure_storage_objects\(uuid\)\s+from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.account_erasure_storage_objects\(uuid\)\s+to service_role/);
    expect(migration).toContain("v_auth_user_id is distinct from p_user_id");
    expect(migration).toContain("'profile_account_mismatch'");
  });

  it("returns a strict bounded deduplicated bucket/path set and rejects ambiguity", () => {
    expect(migration).toContain("select removable.bucket, removable.path");
    expect(migration).toContain("union");
    expect(migration).toContain("if v_count > 5000");
    expect(migration).toContain("'storage_object_limit_exceeded'");
    expect(migration).toContain("'unsupported_storage_bucket'");
    expect(migration).toContain("'invalid_or_foreign_storage_object'");
    expect(migration).toContain("'invalid_storage_backup'");
    expect(migration).toContain("account_erasure_storage_path_is_canonical");
  });

  it("excludes Round144 preservation evidence and includes the other owned buckets", () => {
    for (const bucket of [
      "profile-photos",
      "private-profile-photos",
      "covers",
      "media",
      "profile-media-quarantine",
      "approved-profile-photos",
      "private-migration-backups",
    ]) {
      expect(migration).toContain(`'${bucket}'`);
    }
    expect(migration).toContain("disposition.disposition = 'preserve_unclaimed'");
    expect(migration).toContain("disposition.preserve_owner_media_prefix");
    expect(migration).toContain("account_object.path = disposition.main_path");
    expect(migration).toContain("account_object.path = disposition.thumbnail_path");
  });

  it("queues that snapshot in the same transaction and handles lost-response retries", () => {
    const wrapper = migration.slice(
      migration.indexOf("create or replace function public.queue_account_deletion"),
    );
    const snapshot = wrapper.indexOf("from public.account_erasure_storage_objects(p_user_id)");
    const queue = wrapper.indexOf("return public.queue_account_deletion(", snapshot);
    expect(snapshot).toBeGreaterThan(-1);
    expect(queue).toBeGreaterThan(snapshot);
    expect(wrapper).toContain("from public.account_deletion_jobs job");
    expect(wrapper).toContain("'account_deletion_state_mismatch'");
    expect(wrapper).toContain("'[]'::jsonb");
    expect(migration).toMatch(/revoke all on function public\.queue_account_deletion\(uuid, text\)\s+from public, anon, authenticated/);
  });

  it("ships adversarial runtime coverage for the complete contract", () => {
    for (const label of [
      "snapshot rpc exists on a clean migration train",
      "only service_role can execute the snapshot rpc",
      "wrong account linkage fails closed",
      "an account with no objects returns an empty snapshot",
      "duplicate backup rows collapse to one object",
      "malformed paths fail closed",
      "foreign-owned paths fail closed",
      "preserved legacy dm media is excluded",
      "claimed dm media remains in the cleanup snapshot",
      "the bounded snapshot rejects object 5001",
      "the atomic wrapper persists its exact snapshot",
      "lost-response retry returns the same job",
    ]) {
      expect(pgTap).toContain(label);
    }
  });
});
