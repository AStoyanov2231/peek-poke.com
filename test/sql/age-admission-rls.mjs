import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const candidateDirectory = process.env.AGE_ADMISSION_CANDIDATE_DIR;
const migration = await read("supabase/migrations/20260908125054_account_age_admission.sql");

function section(source, name) {
  const start = `-- BEGIN AGE ${name}\n`;
  const end = `-- END AGE ${name}`;
  assert.equal(source.split(start).length, 2, `one ${name} section must exist`);
  const result = source.split(start)[1].split(end);
  assert.equal(result.length, 2, `${name} must have one closing marker`);
  return result[0];
}

function functionDefinition(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`create (?:or replace )?function ${escaped}\\s*\\([\\s\\S]*?\\bas\\s+(\\$[a-zA-Z_0-9]*\\$)[\\s\\S]*?\\1\\s*;`, "i"));
  assert.ok(match, `${name} must have a complete SQL body`);
  return match[0];
}

const core = candidateDirectory ? migration : section(migration, "CORE");
const canonical = candidateDirectory
  ? (await read(`${candidateDirectory}/age-legacy-rpcs.sql`)).split("-- Exact current legacy")[0]
  : section(migration, "CANONICAL");
const readers = candidateDirectory ? await read(`${candidateDirectory}/age-legacy-readers.sql`) : migration;
const policies = candidateDirectory ? await read(`${candidateDirectory}/age-restrictive-rls.sql`) : section(migration, "RLS");
const [adult, peer, pending, blocked] = [1, 2, 3, 4].map((id) => `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`);
const [eligibleThread, pendingThread] = [1, 2].map((id) => `10000000-0000-4000-8000-${String(id).padStart(12, "0")}`);

const db = await PGlite.create();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema app_private;
    create schema realtime;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.profiles(id uuid primary key, deleted_at timestamptz, display_name text);
    create table public.user_blocks(blocker_id uuid, blocked_id uuid);
    create table public.profile_interests(user_id uuid, tag_id uuid);
    create table public.profile_photos(user_id uuid, url text);
    create table public.friendships(requester_id uuid, addressee_id uuid);
    create table public.friend_meetings(user_a_id uuid, user_b_id uuid);
    create table public.dm_threads(id uuid primary key, participant_1_id uuid, participant_2_id uuid);
    create table public.dm_messages(thread_id uuid, sender_id uuid, content text);
    create table public.chat_rooms(id uuid primary key);
    create table public.chat_room_members(room_id uuid, user_id uuid);
    create table public.chat_room_messages(room_id uuid, sender_id uuid, content text);
    create table realtime.messages(topic text);
    grant usage on schema public, auth, app_private, realtime to authenticated;
    grant select, insert, update, delete on all tables in schema public, realtime to authenticated;
    alter table public.profiles enable row level security;
    create policy fixture_profile_read on public.profiles for select to authenticated using(id = auth.uid());
    create policy fixture_profile_insert on public.profiles for insert to authenticated with check(id = auth.uid());
    create policy fixture_profile_update on public.profiles for update to authenticated using(id = auth.uid()) with check(id = auth.uid());
    alter table public.profile_interests enable row level security;
    create policy fixture_interests on public.profile_interests for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
    alter table public.profile_photos enable row level security;
    create policy fixture_photos on public.profile_photos for select to authenticated using(true);
    alter table public.friendships enable row level security;
    create policy fixture_friendships on public.friendships for select to authenticated using(auth.uid() in (requester_id, addressee_id));
    alter table public.friend_meetings enable row level security;
    create policy fixture_meetings on public.friend_meetings for select to authenticated using(auth.uid() in (user_a_id, user_b_id));
    alter table public.dm_threads enable row level security;
    create policy fixture_threads on public.dm_threads for select to authenticated using(auth.uid() in (participant_1_id, participant_2_id));
    alter table public.dm_messages enable row level security;
    alter table public.chat_rooms enable row level security;
    create policy fixture_rooms on public.chat_rooms for select to authenticated using(true);
    alter table public.chat_room_members enable row level security;
    create policy fixture_members on public.chat_room_members for select to authenticated using(user_id = auth.uid());
    alter table public.chat_room_messages enable row level security;
    create policy fixture_chat_messages on public.chat_room_messages for select to authenticated using(true);
    alter table realtime.messages enable row level security;
    create policy fixture_realtime on realtime.messages for select to authenticated using(topic = 'sync:user:' || auth.uid()::text);
  `);
  await db.exec(core);
  await db.exec(canonical);
  await db.exec(functionDefinition(readers, "app_private.can_access_dm_thread"));
  await db.exec("revoke all on function app_private.can_access_dm_thread(text) from public; grant execute on function app_private.can_access_dm_thread(text) to authenticated;");
  await db.exec("create policy fixture_messages on public.dm_messages for select to authenticated using(app_private.can_access_dm_thread(thread_id::text));");
  await db.exec(policies);
  for (const id of [adult, peer, pending, blocked]) {
    await db.query("insert into public.profiles(id,display_name) values($1,'Original')", [id]);
    await db.query("insert into public.profile_photos(user_id,url) values($1,'fixture')", [id]);
    await db.query("insert into public.chat_room_messages(sender_id,content) values($1,'fixture')", [id]);
    await db.query("insert into realtime.messages(topic) values($1)", [`sync:user:${id}`]);
  }
  for (const id of [adult, peer]) await db.query("select public.record_account_age_admission_v1($1,true)", [id]);
  await db.query("select public.record_account_age_admission_v1($1,false)", [blocked]);
  for (const id of [peer, pending, blocked]) {
    await db.query("insert into public.friendships values($1,$2)", [adult, id]);
    await db.query("insert into public.friend_meetings values($1,$2)", [adult, id]);
  }
  await db.query("insert into public.dm_threads values($1,$2,$3),($4,$2,$5)", [eligibleThread, adult, peer, pendingThread, pending]);
  await db.query("insert into public.dm_messages values($1,$2,'adult'),($3,$4,'pending')", [eligibleThread, peer, pendingThread, pending]);

  const columns = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='account_age_admissions' order by ordinal_position");
  assert.deepEqual(columns.rows.map((row) => row.column_name), ["user_id", "status", "decided_at", "policy_version"]);
  const admissionGrants = await db.query("select has_table_privilege('authenticated','public.account_age_admissions','select') can_read, has_function_privilege('authenticated','public.record_account_age_admission_v1(uuid,boolean)','execute') can_declare");
  assert.deepEqual(admissionGrants.rows[0], { can_read: false, can_declare: false });

  async function asAccount(userId, action) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
    await db.exec("set role authenticated");
    try { return await action(); } finally { await db.exec("reset role"); }
  }
  const count = async (table) => (await db.query(`select count(*)::int count from ${table}`)).rows[0].count;
  for (const id of [pending, blocked]) {
    await asAccount(id, async () => {
      assert.equal(await count("public.profiles"), 1, "own bootstrap profile stays readable");
      for (const table of ["profile_photos", "friendships", "friend_meetings", "dm_threads", "dm_messages", "chat_room_messages"]) {
        assert.equal(await count(`public.${table}`), 0, `${table} must be hidden before admission`);
      }
      assert.equal(await count("realtime.messages"), 0, "even own Realtime topic must be denied");
      const update = await db.query("update public.profiles set display_name='Changed' where id=$1 returning id", [id]);
      assert.equal(update.rows.length, 0, "pending/blocked cannot mutate their profile directly");
    });
  }
  await asAccount(adult, async () => {
    assert.equal(await count("public.profiles"), 1, "new policies must not widen old own-profile access");
    assert.equal(await count("public.profile_photos"), 2, "only admitted subjects remain visible");
    assert.equal(await count("public.friendships"), 1);
    assert.equal(await count("public.friend_meetings"), 1);
    assert.equal(await count("public.dm_threads"), 1);
    assert.equal(await count("public.dm_messages"), 1);
    assert.equal(await count("public.chat_room_messages"), 2);
    assert.equal(await count("realtime.messages"), 1, "an adult still cannot read someone else's topic");
    const update = await db.query("update public.profiles set display_name='Changed' where id=$1 returning id", [adult]);
    assert.equal(update.rows.length, 1);
  });
  await db.query("insert into public.user_blocks values($1,$2)", [peer, adult]);
  await asAccount(adult, async () => {
    assert.equal(await count("public.dm_messages"), 0, "existing bidirectional block boundary must remain effective");
  });
  const policiesInstalled = await db.query("select count(*)::int count from pg_policies where policyname like 'adult admission %' and permissive='RESTRICTIVE'");
  assert.equal(policiesInstalled.rows[0].count, 12);
  console.log("age admission RLS validation passed: actor denial, peer filtering, unchanged authorization, Realtime, and no DOB storage");
} finally {
  await db.close();
}
