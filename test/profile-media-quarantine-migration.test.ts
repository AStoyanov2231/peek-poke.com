import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, parsePlPgSQL } from "@libpg-query/parser";

const migrationPath = new URL(
  "../supabase/migrations/20260807235557_quarantine_profile_media.sql",
  import.meta.url,
);
const migration = readFileSync(migrationPath, "utf8");
const pgTap = readFileSync(
  new URL("../supabase/tests/profile_media_quarantine.test.sql", import.meta.url),
  "utf8",
);

describe("profile media quarantine migration", () => {
  it("parses with the PostgreSQL 17 SQL and PL/pgSQL parsers", async () => {
    await expect(parse(migration)).resolves.toBeTruthy();
    await expect(parsePlPgSQL(migration)).resolves.toBeTruthy();
    await expect(parse(pgTap)).resolves.toBeTruthy();
  });

  it("privatizes the legacy mixed bucket before queuing the durable backfill", () => {
    const privatize = migration.indexOf("set public = false\nwhere id = 'profile-photos'");
    const backfill = migration.indexOf("with candidates as (");

    expect(migration).toContain("('profile-media-quarantine', 'profile-media-quarantine', false)");
    expect(migration).toContain("('approved-profile-photos', 'approved-profile-photos', true)");
    expect(privatize).toBeGreaterThan(0);
    expect(backfill).toBeGreaterThan(privatize);
  });

  it("keeps Storage work durable and service-only with operation-id replay fences", () => {
    expect(migration).toContain("'profile.media_moderation'");
    expect(migration).toContain("outbox_events_profile_media_operation_uidx");
    expect(migration).toContain("profile_media_operation_state");
    expect(migration).toContain("finalize_profile_media_moderation");
    expect(migration).toContain("complete_profile_media_publication");
    expect(migration).toContain("return 'publish'");
    expect(migration).toContain("moderation_operation_id is distinct from p_operation_id");
    expect(migration).toContain("revoke all on function public.request_profile_media_moderation");
    expect(migration).toContain("grant execute on function public.request_profile_media_moderation");
    expect(migration).toContain("revoke all on function public.complete_profile_media_publication");
    expect(migration).toContain("grant execute on function public.complete_profile_media_publication");
  });

  it("models anonymous access without pretending Storage and Postgres are atomic", () => {
    expect(migration).toContain("('approved-profile-photos', 'approved-profile-photos', true)");
    expect(migration).toContain("when p_storage_bucket = 'approved-profile-photos' then moderation_action");
    expect(migration).toContain("public.complete_profile_media_publication(");
    expect(migration).not.toContain("Postgres and Storage share a transaction");
  });

  it("atomically restores only the exact immutable event while holding the photo fence", () => {
    const rowLock = migration.indexOf("where id = p_photo_id\n  for update");
    const ensure = migration.indexOf("create or replace function public.ensure_profile_media_operation_event");

    expect(rowLock).toBeGreaterThan(0);
    expect(ensure).toBeGreaterThan(0);
    expect(migration).toContain("set status = 'pending'");
    expect(migration).toContain("v_event.status in ('dead', 'completed')");
    expect(migration).toContain("v_event.payload is distinct from v_photo.moderation_event_payload");
    expect(migration).toContain("extensions.digest(v_event_payload::text, 'sha256')");
    expect(migration).toContain("extensions.digest(v_photo.moderation_event_payload::text, 'sha256')");
    expect(migration).toContain("p_operation_id,\n    v_photo.moderation_event_payload");
    expect(migration).toContain("_moderation_queue_state");
  });

  it("never promotes a quarantined event payload into authoritative remediation work", () => {
    const remediation = migration.slice(
      migration.indexOf("create or replace function public.resolve_profile_media_remediation"),
      migration.indexOf("create or replace function public.guard_active_profile_media_event"),
    );

    expect(remediation).toContain("v_payload := v_photo.moderation_event_payload");
    expect(remediation).toContain("REMEDIATION_SNAPSHOT_MISSING");
    expect(remediation).toContain("REMEDIATION_SNAPSHOT_DIGEST_MISMATCH");
    expect(remediation).toContain("v_photo.moderation_event_payload_digest");
    expect(remediation).toContain("'profile.media_moderation.remediation'");
    expect(remediation).toContain("event.payload ->> 'photo_id' = p_photo_id::text");
    expect(remediation).not.toContain("v_payload := v_event.payload");
    expect(remediation).not.toContain("set moderation_event_payload = v_payload");
  });

  it("validates action-specific bucket/path roles and serializes response-loss retries", () => {
    const remediation = migration.slice(
      migration.indexOf("create or replace function public.resolve_profile_media_remediation"),
      migration.indexOf("create or replace function public.guard_active_profile_media_event"),
    );

    expect(remediation).toContain("for update");
    expect(remediation).toContain("v_alert.status = 'resolved'");
    expect(remediation).toContain("_remediation_replayed");
    expect(remediation).toContain("REMEDIATION_ALREADY_RESOLVED");
    expect(remediation).toContain("v_destination_bucket is distinct from case");
    expect(remediation).toContain("v_photo.is_private then 'private-profile-photos'");
    expect(remediation).toContain("v_photo.moderation_action = 'reject'");
    expect(remediation).toContain("v_payload ->> 'destination_path' is not null");
    expect(remediation).toContain("left(v_payload ->> 'source_path'");
    expect(remediation).toContain("left(v_payload ->> 'destination_path'");
  });

  it("repairs missing active work before claims and blocks destructive event races", () => {
    const repair = migration.indexOf("perform public.repair_missing_profile_media_events(p_limit)");
    const claim = migration.indexOf("return query\n  with claimable as (", repair);

    expect(migration).toContain("outbox_events_profile_media_live_photo_uidx");
    expect(migration).toContain("profile_photos_moderation_event_fence_check");
    expect(migration).toContain("guard_active_profile_media_event_change");
    expect(migration).toContain("Cannot delete the event for an active profile media operation");
    expect(repair).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(repair);
  });

  it("normalizes malformed leases and proves processing ownership before route acceptance", () => {
    expect(migration).toContain("outbox_events_profile_media_lease_check");
    expect(migration).toContain("event.locked_at >= now() - interval '5 minutes'");
    expect(migration).toContain("event.locked_at <= now()");
    expect(migration).toContain("event.locked_at is null");
    expect(migration).toContain("or event.locked_at > now()");
    expect(migration).toContain("Pending profile media work cannot retain a processing lease");
    expect(migration).toContain("Profile media processing requires a valid worker lease");
    expect(migration).toContain("Cannot replace an unexpired profile media worker lease");
    expect(migration).toContain("set_config('peekpoke.outbox_worker_id', p_worker_id, true)");
    expect(migration).toContain("validate constraint outbox_events_profile_media_lease_check");
  });

  it("isolates corrupt operations and retains server-only operator remediation evidence", () => {
    expect(migration).toContain("create table if not exists public.profile_media_remediation_alerts");
    expect(migration).toContain("alter table public.profile_media_remediation_alerts enable row level security");
    expect(migration).toContain("occurrence_count between 1 and 1000");
    expect(migration).toContain("profile_media_remediation_alert_failed");
    expect(migration).toContain("continue;");
    expect(migration).toContain("resolve_profile_media_remediation");
    expect(migration).toContain("'profile.media_moderation.remediation'");
    expect(migration).toContain("'MEDIA_REMEDIATION_REQUIRED'");
    expect(migration).not.toContain("raise exception 'MEDIA_EVENT_CONFLICT for profile photo");
  });

  it("uses identical source/destination lifecycle fields for cover and gallery photos", () => {
    for (const field of [
      "source_bucket",
      "source_path",
      "source_thumbnail_path",
      "destination_bucket",
      "destination_path",
      "destination_thumbnail_path",
    ]) {
      expect(migration.match(new RegExp(`'${field}'`, "g"))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(migration).not.toContain("profile.cover_media_moderation");
  });
});
