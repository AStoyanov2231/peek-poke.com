import { readFileSync } from "node:fs";
import { parse, parsePlPgSQL } from "@libpg-query/parser";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808080050_account_erasure_safe_dm_media.sql",
  "utf8",
).toLowerCase();
const pgTap = readFileSync(
  "supabase/tests/account_erasure_dm_media.test.sql",
  "utf8",
).toLowerCase();

describe("account-erasure-safe DM media migration", () => {
  it("parses the migration, every PL/pgSQL body, and the pgTAP fixture with PostgreSQL 17", async () => {
    const [migrationSql, migrationPlPgSql, pgTapSql] = await Promise.all([
      parse(migration),
      parsePlPgSQL(migration),
      parse(pgTap),
    ]);

    expect(Math.floor(migrationSql.version / 10_000)).toBe(17);
    expect(migrationSql.stmts.length).toBeGreaterThan(15);
    expect(migrationPlPgSql.plpgsql_funcs).toHaveLength(7);
    expect(Math.floor(pgTapSql.version / 10_000)).toBe(17);
    expect(pgTap).toContain("select plan(34)");
  });

  it("uses immutable server evidence instead of a caller-controlled bypass", () => {
    expect(migration).toContain("public.dm_media_account_erasure_dispositions");
    expect(migration).toContain("before update or delete on public.dm_media_account_erasure_dispositions");
    expect(migration).toContain("dm media account-erasure disposition is immutable");
    expect(migration).toContain("alter table public.dm_media_account_erasure_dispositions enable row level security");
    expect(migration).toContain("revoke all on public.dm_media_account_erasure_dispositions");
    expect(migration).not.toContain("current_setting");
    expect(migration).not.toContain("set_config");
  });

  it("classifies only an unfenced exact claim and generation as cleanup-safe", () => {
    const prepare = migration.slice(
      migration.indexOf("create or replace function app_private.prepare_dm_media_account_erasure"),
      migration.indexOf("revoke all on function app_private.prepare_dm_media_account_erasure"),
    );

    expect(prepare).toContain("claim.thread_id = candidate.thread_id");
    expect(prepare).toContain("claim.actor_id = candidate.actor_id");
    expect(prepare).toContain("claim.client_id is not distinct from candidate.client_id");
    expect(prepare).toContain("claim.main_path = candidate.canonical_main_path");
    expect(prepare).toContain("claim.cleanup_fenced_at is null");
    expect(prepare).toContain("conflict.message_id is null");
    expect(prepare).toContain("main_generation.cleanup_fenced_at is null");
    expect(prepare).toContain("thumbnail_generation.cleanup_fenced_at is null");
    expect(prepare).toContain("then 'claimed_account_cleanup'");
    expect(prepare).toContain("else 'preserve_unclaimed'");
    expect(prepare).toContain("on conflict (message_id) do nothing");
  });

  it("allows only matching preservation evidence through the ordinary claim fence", () => {
    const fence = migration.slice(
      migration.indexOf("create or replace function app_private.fence_dm_media_claim_before_delete"),
      migration.indexOf("revoke all on function app_private.fence_dm_media_claim_before_delete"),
    );

    expect(fence).toContain("disposition.thread_id = old.thread_id");
    expect(fence).toContain("disposition.actor_id = old.sender_id");
    expect(fence).toContain("disposition.client_id is not distinct from old.client_id");
    expect(fence).toContain("disposition.original_media_url is not distinct from old.media_url");
    expect(fence).toContain("disposition.original_thumbnail_url is not distinct from old.media_thumbnail_url");
    expect(fence).toContain("v_erasure_disposition = 'preserve_unclaimed'");
    expect(fence).toContain("claim.cleanup_fenced_at is null");
    expect(fence).toContain("raise exception 'dm media claim is unavailable'");
  });

  it("atomically erases before queueing and excludes preserved media from Storage cleanup", () => {
    const queue = migration.slice(
      migration.indexOf("create or replace function public.queue_account_deletion"),
    );
    const eraseCall = queue.indexOf("v_erasure := public.erase_account_data(p_user_id)");
    const jobInsert = queue.indexOf("insert into public.account_deletion_jobs");

    expect(eraseCall).toBeGreaterThan(-1);
    expect(jobInsert).toBeGreaterThan(eraseCall);
    expect(queue).toContain("'storage_object_ownership_mismatch'");
    expect(queue).toContain("disposition.disposition = 'preserve_unclaimed'");
    expect(queue).toContain("disposition.preserve_owner_media_prefix");
    expect(queue).toContain("object.path = disposition.main_path");
    expect(queue).toContain("object.path = disposition.thumbnail_path");
    expect(queue).toContain("on conflict (user_id) do update");
    expect(queue).toContain("on conflict (event_type, aggregate_id)");
    expect(migration).toContain("outbox_events_account_cleanup_uidx");
  });

  it("keeps erasure RPCs service-only", () => {
    expect(migration).toMatch(/revoke all on function public\.erase_account_data\(uuid\)\s+from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.erase_account_data\(uuid\)\s+to service_role/);
    expect(migration).toMatch(/revoke all on function public\.queue_account_deletion\(uuid, text, jsonb\)\s+from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.queue_account_deletion\(uuid, text, jsonb\)\s+to service_role/);
  });

  it("covers mixed erasure, rollback, preservation, retry, ordinary cleanup, and grants", () => {
    expect(pgTap).toContain("wrong-account storage objects are rejected before erasure");
    expect(pgTap).toContain("a rejected queue attempt leaves profile, job, and evidence unchanged");
    expect(pgTap).toContain("account erasure tombstones claimed, duplicate, invalid, and text messages together");
    expect(pgTap).toContain("shared and unclaimed storage generations remain intact for remediation");
    expect(pgTap).toContain("lost-response retry returns the same deletion job");
    expect(pgTap).toContain("a post-erasure queue failure aborts the account workflow statement");
    expect(pgTap).toContain("the failed statement rolls back tombstone, fences, evidence, profile, and job");
    expect(pgTap).toContain("the same account deletion can retry after a transactional rollback");
    expect(pgTap).toContain("ordinary claimed deletion still queues exact media cleanup");
    expect(pgTap).toContain("ordinary unclaimed deletion cannot use the account-erasure exception");
    expect(pgTap).toContain("only the trusted service can invoke account erasure workflows");
  });
});
