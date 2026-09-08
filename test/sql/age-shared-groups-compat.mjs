import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(import.meta.dirname, "../..");
const ageMigration = await readFile(resolve(root, "supabase/migrations/20260908134739_account_age_admission.sql"), "utf8");
const correctionMigration = await readFile(resolve(root, "supabase/migrations/20260908135910_adult_social_runtime_corrections.sql"), "utf8");
const readerMarker = "-- Captured get_shared_groups(uuid,timestamptz,uuid,integer);";
const readerStart = ageMigration.indexOf(readerMarker);
assert.ok(readerStart >= 0, "age migration must contain the four-argument group reader");
const readerEnd = ageMigration.indexOf("$function$;", readerStart);
assert.ok(readerEnd >= 0, "age migration four-argument group reader must be complete");
const readerSql = ageMigration.slice(readerStart, readerEnd + "$function$;".length);
const compatibilitySql = correctionMigration.split("-- BEGIN AGE SHARED_GROUPS COMPAT CORRECTION\n")[1]?.split("-- END AGE SHARED_GROUPS COMPAT CORRECTION")[0];
assert.ok(compatibilitySql, "runtime corrections migration must contain the compatibility reader");

const actor = "00000000-0000-4000-8000-000000000001";
const peer = "00000000-0000-4000-8000-000000000002";
const groupId = "10000000-0000-4000-8000-000000000001";
const db = await PGlite.create();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.profiles(id uuid primary key, deleted_at timestamptz);
    create table public.shared_groups(
      id uuid primary key,
      created_at timestamptz not null,
      last_message_at timestamptz,
      last_message_preview text
    );
    create table public.shared_group_members(
      group_id uuid not null,
      user_id uuid not null,
      last_read_sequence bigint not null default 0
    );
    create table public.shared_group_messages(group_id uuid not null, sequence bigint not null);
    create function public.require_adult_social_admission_v1(uuid) returns void language plpgsql as $$ begin end; $$;
    create function public.can_users_interact_v1(uuid, uuid) returns boolean language sql stable as $$ select true $$;
  `);
  await db.exec(readerSql);
  await db.exec(compatibilitySql);
  await db.query("insert into public.profiles(id) values($1),($2)", [actor, peer]);
  await db.query("insert into public.shared_groups(id,created_at,last_message_at,last_message_preview) values($1,'2026-09-08T10:00:00Z','2026-09-08T10:01:00Z','hello')", [groupId]);
  await db.query("insert into public.shared_group_members(group_id,user_id,last_read_sequence) values($1,$2,0),($1,$3,0)", [groupId, actor, peer]);
  await db.query("insert into public.shared_group_messages(group_id,sequence) values($1,1)", [groupId]);

  const listed = await db.query("select public.get_shared_groups($1) groups", [actor]);
  assert.equal(listed.rows[0].groups.length, 1, "one-argument compatibility reader forwards the explicit service actor");
  assert.equal(listed.rows[0].groups[0].id, groupId);
  const grants = await db.query(`
    select
      has_function_privilege('authenticated', 'public.get_shared_groups(uuid)', 'execute') as authenticated_can_read,
      has_function_privilege('service_role', 'public.get_shared_groups(uuid)', 'execute') as service_can_read
  `);
  assert.deepEqual(grants.rows[0], { authenticated_can_read: false, service_can_read: true });
  process.stdout.write("age shared-group compatibility SQL validation passed: explicit service actor forwards to the bounded reader\n");
} finally {
  await db.close();
}
