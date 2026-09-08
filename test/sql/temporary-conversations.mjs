import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const actor = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const blocked = "44444444-4444-4444-8444-444444444444";
const thread = "55555555-5555-4555-8555-555555555555";
const legacy = "66666666-6666-4666-8666-666666666666";
const call = "77777777-7777-4777-8777-777777777777";
const message = "88888888-8888-4888-8888-888888888888";
const migration = await readFile(new URL("../../supabase/migrations/20260908221806_temporary_poke_conversations.sql", import.meta.url), "utf8");
const db = await PGlite.create();
let assertions = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); assertions += 1; };
async function denied(sql, code = "PT409", params = []) {
  await assert.rejects(db.query(sql, params), (error) => error.code === code);
  assertions += 1;
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema app_private;
    create table public.profiles(id uuid primary key, deleted_at timestamptz, onboarding_completed boolean default true);
    create table public.dm_threads(id uuid primary key, participant_1_id uuid, participant_2_id uuid);
    create table public.dm_thread_members(thread_id uuid, user_id uuid);
    create table public.user_blocks(blocker_id uuid, blocked_id uuid);
    create table public.friendships(requester_id uuid, addressee_id uuid, status text);
    create table public.pokes(id uuid primary key default gen_random_uuid(), thread_id uuid, status text, responded_at timestamptz);
    create table public.dm_messages(id uuid primary key default gen_random_uuid(), thread_id uuid, sender_id uuid,
      content text, message_type text default 'text', media_url text, media_thumbnail_url text, reply_to_id uuid,
      is_deleted boolean default false, is_read boolean default false);
    create table public.call_sessions(id uuid primary key default gen_random_uuid(), thread_id uuid, caller_id uuid, callee_id uuid, state text, expires_at timestamptz);
    create function public.is_adult_social_admitted_v1(id uuid) returns boolean language sql as $$ select id <> '${blocked}'::uuid $$;
    create function public.require_adult_social_admission_v1(id uuid) returns void language plpgsql as $$ begin
      if not public.is_adult_social_admitted_v1(id) then raise exception 'Admission required' using errcode = '42501'; end if;
    end $$;
    create function public.can_users_interact_v1(a uuid,b uuid) returns boolean language sql as $$
      select public.is_adult_social_admitted_v1(a) and public.is_adult_social_admitted_v1(b)
        and (select count(*) from public.profiles where id in (a,b) and deleted_at is null) = 2;
    $$;
    insert into profiles(id) values('${actor}'),('${peer}'),('${outsider}'),('${blocked}');
    insert into dm_threads values('${thread}','${actor}','${peer}'),('${legacy}','${actor}','${outsider}');
    insert into dm_thread_members values('${thread}','${actor}'),('${thread}','${peer}');
    insert into pokes(thread_id,status,responded_at) values('${thread}','accepted',now()-interval '25 hours');
    insert into dm_messages(id,thread_id,sender_id,content) values('${message}','${thread}','${peer}','Retained history');
    insert into call_sessions(id,thread_id,caller_id,callee_id,state,expires_at)
      values('${call}','${thread}','${actor}','${peer}','invited',now()+interval '1 minute');
  `);
  await db.exec(migration);
  const facts = (await db.query("select public.read_dm_conversation_facts_v1($1,$2) as value", [actor, thread])).rows[0].value;
  check(facts.friendship_accepted, false);
  check(Date.parse(facts.server_now) - Date.parse(facts.latest_poke_accepted_at) >= 25 * 60 * 60 * 1000, true);
  check((await db.query("select content from dm_messages where id=$1", [message])).rows[0].content, "Retained history");
  await denied("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'New text')", "PT409", [thread, actor]);
  await denied("insert into dm_messages(thread_id,sender_id,content,message_type,media_url) values($1,$2,'Image','image','fixture')", "PT409", [thread, actor]);
  await denied("update dm_messages set content='Edited after expiry' where id=$1", "PT409", [message]);
  await db.query("update dm_messages set is_read=true where id=$1", [message]);
  check((await db.query("select is_read from dm_messages where id=$1", [message])).rows[0].is_read, true);
  await db.query("update dm_messages set is_deleted=true,content=null where id=$1", [message]);
  check((await db.query("select is_deleted from dm_messages where id=$1", [message])).rows[0].is_deleted, true);
  await db.query("insert into dm_messages(thread_id,sender_id,content,message_type) values($1,$2,'Call ended','system')", [thread, actor]);
  await denied("insert into call_sessions(thread_id,caller_id,callee_id,state) values($1,$2,$3,'invited')", "PT409", [thread, actor, peer]);
  check((await db.query("select public.authorize_call_invite_delivery($1,$2,$3,$4) as allowed", [call, thread, actor, peer])).rows[0].allowed, false);
  await db.query("update call_sessions set state='ended' where id=$1", [call]);
  check((await db.query("select state from call_sessions where id=$1", [call])).rows[0].state, "ended");
  await db.query("insert into pokes(thread_id,status,responded_at) values($1,'pending',now())", [thread]);
  await denied("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'Pending is not renewal')", "PT409", [thread, actor]);
  await db.query("update pokes set status='accepted' where thread_id=$1 and status='pending'", [thread]);
  await db.query("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'Renewed')", [thread, actor]);
  await db.query("update call_sessions set state='invited' where id=$1", [call]);
  check((await db.query("select public.authorize_call_invite_delivery($1,$2,$3,$4) as allowed", [call, thread, actor, peer])).rows[0].allowed, true);
  await db.query("insert into user_blocks values($1,$2)", [actor, peer]);
  check((await db.query("select public.authorize_call_invite_delivery($1,$2,$3,$4) as allowed", [call, thread, actor, peer])).rows[0].allowed, false);
  await db.query("delete from user_blocks");
  check((await db.query("select count(*)::int as count from dm_messages where content='Renewed'")).rows[0].count, 1);
  await db.query("update pokes set responded_at=now()-interval '25 hours' where thread_id=$1", [thread]);
  await db.query("insert into friendships values($1,$2,'accepted')", [actor, peer]);
  check((await db.query("select app_private.dm_conversation_expires_at_v1($1) as expiry", [thread])).rows[0].expiry, null);
  await db.query("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'Friends can continue')", [thread, actor]);
  await db.query("delete from friendships");
  await denied("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'Friendship removed')", "PT409", [thread, actor]);
  await db.query("insert into dm_messages(thread_id,sender_id,content) values($1,$2,'Legacy conversation')", [legacy, actor]);
  check((await db.query("select app_private.dm_conversation_expires_at_v1($1) as expiry", [legacy])).rows[0].expiry, null);
  await denied("select public.read_dm_conversation_facts_v1($1,$2)", "42501", [outsider, thread]);
  await denied("select public.read_dm_conversation_facts_v1($1,$2)", "42501", [blocked, thread]);
  check((await db.query("select has_function_privilege('authenticated','public.read_dm_conversation_facts_v1(uuid,uuid)','execute') as allowed")).rows[0].allowed, false);
  check((await db.query("select has_function_privilege('anon','app_private.dm_conversation_expires_at_v1(uuid)','execute') as allowed")).rows[0].allowed, false);
  check((await db.query("select has_function_privilege('service_role','public.read_dm_conversation_facts_v1(uuid,uuid)','execute') as allowed")).rows[0].allowed, true);
  console.log(`Temporary conversation database guards: ${assertions} assertions passed.`);
} finally { await db.close(); }
