import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, parsePlPgSQL } from "@libpg-query/parser";
import {
  DM_MESSAGE_DELETE_OPERATION,
  DM_MESSAGE_EDIT_OPERATION,
  dmMessageDeleteHash,
  dmMessageEditHash,
} from "@/lib/dm-message-mutation-idempotency";

const migration = readFileSync(
  "supabase/migrations/20260807234535_atomic_dm_message_mutations.sql",
  "utf8",
).toLowerCase();
const claimMigration = readFileSync(
  "supabase/migrations/20260808005611_exclusive_dm_media_claims.sql",
  "utf8",
).toLowerCase();
const pgTap = readFileSync(
  "supabase/tests/dm_message_mutations.test.sql",
  "utf8",
).toLowerCase();
const mutationFunction = migration.slice(
  migration.indexOf("create or replace function public.mutate_dm_message_idempotent"),
  migration.indexOf("create or replace function public.authorize_dm_media_cleanup"),
);
const immutabilityFunction = migration.slice(
  migration.indexOf("create or replace function app_private.enforce_dm_media_path_immutability"),
  migration.indexOf("create or replace function app_private.register_dm_media_path_generation"),
);
const registrationFunction = migration.slice(
  migration.indexOf("create or replace function app_private.register_dm_media_path_generation"),
  migration.indexOf("revoke all on function app_private.enforce_dm_media_path_immutability"),
);
const sendClaimFunction = claimMigration.slice(
  claimMigration.indexOf("create or replace function public.send_message_transactional"),
  claimMigration.indexOf("revoke all on function public.send_message_transactional"),
);
const claimBindingFunction = claimMigration.slice(
  claimMigration.indexOf("create or replace function app_private.enforce_dm_media_claim_binding"),
  claimMigration.indexOf("revoke all on function app_private.enforce_dm_media_claim_binding"),
);
const deleteFenceFunction = claimMigration.slice(
  claimMigration.indexOf("create or replace function app_private.fence_dm_media_claim_before_delete"),
  claimMigration.indexOf("revoke all on function app_private.fence_dm_media_claim_before_delete"),
);
const claimAuthorizationFunction = claimMigration.slice(
  claimMigration.indexOf("create or replace function public.authorize_dm_media_cleanup"),
  claimMigration.indexOf("revoke all on function public.authorize_dm_media_cleanup"),
);

describe("atomic DM message mutation migration", () => {
  it("parses the migration and pgTAP fixture with PostgreSQL 17", async () => {
    const [migrationSql, claimMigrationSql, migrationPlPgSql, immutabilityPlPgSql, registrationPlPgSql, sendClaimPlPgSql, claimBindingPlPgSql, deleteFencePlPgSql, claimAuthorizationPlPgSql, pgTapSql] = await Promise.all([
      parse(migration),
      parse(claimMigration),
      parsePlPgSQL(mutationFunction),
      parsePlPgSQL(immutabilityFunction),
      parsePlPgSQL(registrationFunction),
      parsePlPgSQL(sendClaimFunction),
      parsePlPgSQL(claimBindingFunction),
      parsePlPgSQL(deleteFenceFunction),
      parsePlPgSQL(claimAuthorizationFunction),
      parse(pgTap),
    ]);
    expect(Math.floor(migrationSql.version / 10_000)).toBe(17);
    expect(Math.floor(claimMigrationSql.version / 10_000)).toBe(17);
    expect(migrationSql.stmts.length).toBeGreaterThan(5);
    expect(claimMigrationSql.stmts.length).toBeGreaterThan(10);
    expect(migrationPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(immutabilityPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(registrationPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(sendClaimPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(claimBindingPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(deleteFencePlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(claimAuthorizationPlPgSql.plpgsql_funcs.length).toBeGreaterThanOrEqual(1);
    expect(Math.floor(pgTapSql.version / 10_000)).toBe(17);
    expect(pgTap).toContain("select plan(52)");
  });

  it("serializes caller, operation, and key before locking mutable account/thread/message state", () => {
    const claimLock = migration.indexOf("pg_catalog.pg_advisory_xact_lock");
    const profileFence = migration.indexOf("profile.deleted_at is null", claimLock);
    const threadFence = migration.indexOf("p_actor_id in (thread.participant_1_id, thread.participant_2_id)", profileFence);
    const messageLock = migration.indexOf("for update;", threadFence);
    expect(claimLock).toBeGreaterThan(-1);
    expect(profileFence).toBeGreaterThan(claimLock);
    expect(threadFence).toBeGreaterThan(profileFence);
    expect(messageLock).toBeGreaterThan(threadFence);
    expect(migration).toContain("if v_stored_hash is distinct from p_request_hash then");
    expect(migration).toContain("'code', 'idempotency_key_reused'");
  });

  it("atomically tombstones media and persists an immutable cleanup snapshot beside the outbox", () => {
    const tombstone = migration.indexOf("set is_deleted = true");
    const cleanup = migration.indexOf("'dm.media_cleanup'", tombstone);
    const response = migration.indexOf("insert into public.idempotency_records", cleanup);
    expect(tombstone).toBeGreaterThan(-1);
    expect(migration.slice(tombstone, cleanup)).toContain("media_url = null");
    expect(cleanup).toBeGreaterThan(tombstone);
    expect(response).toBeGreaterThan(cleanup);
    expect(migration).toContain("outbox_events_dm_media_cleanup_uidx");
    expect(migration).toContain("public.dm_media_cleanup_snapshots");
    expect(migration).toContain("outbox_event_id uuid not null unique");
    expect(migration).toContain("main_object_digest text not null");
    expect(migration).toContain("thumbnail_object_digest text");
    expect(migration).toContain("from storage.objects object");
    expect(migration).toContain("for share;");
  });

  it("keeps mutation and cleanup authorization service-only", () => {
    expect(migration).toMatch(/create or replace function public\.mutate_dm_message_idempotent\([\s\S]*security definer\s+set search_path = ''/);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("create or replace function public.authorize_dm_media_cleanup");
    expect(migration).toContain("revoke all on public.dm_media_cleanup_snapshots");
  });

  it("binds authorization to the exact event, positional path set, and current Storage generation", () => {
    const authorization = migration.slice(
      migration.indexOf("create or replace function public.authorize_dm_media_cleanup"),
    );
    expect(authorization).toContain("snapshot.outbox_event_id = p_event_id");
    expect(authorization).toContain("snapshot.cleanup_id = p_cleanup_id");
    expect(authorization).toContain("snapshot.main_path = p_main_path");
    expect(authorization).toContain("snapshot.thumbnail_path is not distinct from p_thumbnail_path");
    expect(authorization).toContain("event.payload = pg_catalog.jsonb_build_object");
    expect(authorization).toContain("main_object.id is not distinct from snapshot.main_object_id");
    expect(authorization).toContain("main_object.version is not distinct from snapshot.main_object_version");
    expect(authorization).toContain("app_private.dm_media_storage_object_digest");
    expect(authorization).toContain("main_object.id is null");
    expect(authorization).toContain("main_generation.object_digest = snapshot.main_object_digest");
  });

  it("permanently prevents replacement and reuse without blocking DELETE or fresh paths", () => {
    expect(migration).toContain("create table if not exists public.dm_media_path_generations");
    expect(migration).toContain("primary key (bucket_id, path)");
    expect(migration).toContain("if tg_op = 'insert'");
    expect(migration).toContain("app_private.is_canonical_dm_media_path(new.name)");
    expect(migration).toContain("if tg_op = 'update' and (");
    expect(migration).toContain("dm media path is immutable and cannot be reused");
    expect(migration).toContain("dm media path is immutable and cannot be replaced");
    expect(migration).toContain("before insert or update on storage.objects");
    expect(migration).toContain("after insert on storage.objects");
    expect(migration).not.toContain("before insert or update or delete on storage.objects");
    expect(migration).not.toContain("expires_at timestamptz");
    expect(pgTap).toContain("a replacement cannot enter between authorization and remove-by-path");
    expect(pgTap).toContain("a crash after storage deletion can safely retry the idempotent remove");
    expect(pgTap).toContain("a legitimate upload at a fresh server-generated path is allowed");
  });

  it("claims each immutable media pair for exactly one owner-bound message", () => {
    expect(claimMigration).toContain("create table if not exists public.dm_media_claims");
    expect(claimMigration).toContain("message_id uuid primary key");
    expect(claimMigration).toContain("unique (thread_id, client_id)");
    expect(claimMigration).toContain("main_path text not null unique");
    expect(claimMigration).toContain("thumbnail_path text unique");
    expect(claimMigration).toContain("create trigger enforce_dm_media_claim_binding_before_write");
    expect(claimBindingFunction).toContain("message.thread_id = new.thread_id");
    expect(claimBindingFunction).toContain("message.sender_id = new.actor_id");
    expect(claimBindingFunction).toContain("message.client_id = new.client_id");
    expect(claimBindingFunction).toContain("dm media claim binding is immutable");
    expect(claimMigration).toContain("order by generation.path");
    expect(claimMigration).toContain("for update;");
    expect(claimMigration).toContain("'error', 'media_already_claimed'");
    expect(claimMigration).toContain("'error', 'idempotency_key_reused'");
    expect(claimMigration).toContain("set claimed_message_id = v_message_id");
    expect(claimMigration).toContain("claim_role = 'main'");
    expect(claimMigration).toContain("claim_role = 'thumbnail'");
    expect(pgTap).toContain("serializes a competing a/b claim race to one winner");
    expect(pgTap).toContain("same client key replays the exact claimed message");
    expect(pgTap).toContain("leaves neither a message nor an orphan claim");
  });

  it("fences deletion permanently and authorizes only the exact unshared pair", () => {
    expect(claimMigration).toContain("create trigger fence_dm_media_claim_before_delete");
    expect(deleteFenceFunction).toContain("claim.cleanup_fenced_at is null");
    expect(deleteFenceFunction).toContain("set cleanup_fenced_at = v_fenced_at");
    expect(claimAuthorizationFunction).toContain("claim.message_id = snapshot.message_id");
    expect(claimAuthorizationFunction).toContain("claim.client_id = message.client_id");
    expect(claimAuthorizationFunction).toContain("claim.cleanup_fenced_at is not null");
    expect(claimAuthorizationFunction).toContain("main_generation.claimed_message_id = snapshot.message_id");
    expect(claimAuthorizationFunction).toContain("from public.dm_media_claims competitor");
    expect(claimAuthorizationFunction).toContain("competing_message.is_deleted = false");
    expect(pgTap).toContain("blocked after cleanup authorization and before remove");
  });

  it("records legacy duplicate evidence and refuses to claim or delete it", () => {
    expect(claimMigration).toContain("create table if not exists public.dm_media_claim_backfill_conflicts");
    expect(claimMigration).toContain("having pg_catalog.count(distinct reference.message_id) > 1");
    expect(claimMigration).toContain("then 'duplicate_path'");
    expect(claimMigration).toContain("related_message_ids");
    expect(claimMigration).toContain("where classified.reason is not null");
    expect(claimMigration).toContain("where not exists (");
    expect(claimMigration).toContain("raise exception 'dm media claim is unavailable'");
    expect(pgTap).toContain("legacy duplicate references retain per-message remediation evidence");
    expect(pgTap).toContain("leaves the shared storage generation intact");
  });

  it("binds actor, operation, thread, message, and canonical edit body into hashes", () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const thread = "22222222-2222-4222-8222-222222222222";
    const message = "33333333-3333-4333-8333-333333333333";
    expect(DM_MESSAGE_EDIT_OPERATION).toBe("dm_message:edit");
    expect(DM_MESSAGE_DELETE_OPERATION).toBe("dm_message:delete");
    expect(dmMessageEditHash(actor, thread, message, { content: "  value  " }))
      .toBe(dmMessageEditHash(actor, thread, message, { content: "value" }));
    expect(dmMessageEditHash(actor, thread, message, { content: "value" }))
      .not.toBe(dmMessageDeleteHash(actor, thread, message));
    expect(dmMessageDeleteHash(actor, thread, message))
      .not.toBe(dmMessageDeleteHash(actor, thread, actor));
  });
});
