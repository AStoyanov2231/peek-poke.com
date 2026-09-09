import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { actor, peer, outsider, blocked, thread, legacy, call, message, lifecycleFixtureSql, rpcFixtureSql, rpcDefinitions } from "./temporary-conversation-fixture.mjs";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../supabase/migrations/20260908221806_temporary_poke_conversations.sql", import.meta.url), "utf8");
const db = await PGlite.create();
let assertions = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); assertions += 1; };
async function denied(sql, code = "PT409", params = []) {
  await assert.rejects(db.query(sql, params), (error) => error.code === code);
  assertions += 1;
}
try {
  await db.exec(lifecycleFixtureSql);
  await db.exec(rpcFixtureSql);
  await db.exec(rpcDefinitions);
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

  // Exercise the actual message RPC, including its sequence allocation and outbox.
  await db.query("update pokes set responded_at=now() where thread_id=$1", [thread]);
  const clientId = "99999999-9999-4999-8999-999999999999";
  const sendSql = "select public.send_message_transactional($1,$2,$3,$4) as result";
  const sent = (await db.query(sendSql, [thread, actor, clientId, "Committed before expiry"])).rows[0].result;
  check(sent.deduplicated, false);
  check(sent.message.content, "Committed before expiry");
  await db.query("update pokes set responded_at=now()-interval '24 hours' where thread_id=$1", [thread]);
  const replay = (await db.query(sendSql, [thread, actor, clientId, "Committed before expiry"])).rows[0].result;
  check(replay.deduplicated, true);
  check(replay.message.id, sent.message.id);
  await denied(sendSql, "PT409", [thread, actor, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Expired new attempt"]);
  check((await db.query("select next_message_sequence from dm_threads where id=$1", [thread])).rows[0].next_message_sequence, 1);
  check((await db.query("select count(*)::int count from outbox_events where event_type='message.changed'")).rows[0].count, 1);
  check((await db.query(sendSql, [thread, actor, clientId, "Changed payload"])).rows[0].result.error, "IDEMPOTENCY_KEY_REUSED");

  // New call requests use the actual production begin RPC and its partial index.
  await db.query("update call_sessions set state='ended'");
  await db.query("update pokes set responded_at=now() where thread_id=$1", [thread]);
  const newCall = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const command = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const beginSql = "select public.begin_call_session($1,$2,$3,$4,$5) as result";
  const started = (await db.query(beginSql, [newCall, thread, actor, command, "a".repeat(64)])).rows[0].result;
  check(started.replayed, false);

  await db.query("update pokes set responded_at=now()-interval '24 hours' where thread_id=$1", [thread]);
  const callReplay = (await db.query(beginSql, [newCall, thread, actor, command, "a".repeat(64)])).rows[0].result;
  check(callReplay.replayed, true);
  check(callReplay.capability, started.capability);
  check((await db.query("select count(*)::int count from outbox_events where event_type='call.invite'")).rows[0].count, 1);
  check((await db.query("select public.authorize_call_invite_delivery($1,$2,$3,$4) as allowed", [newCall, thread, actor, peer])).rows[0].allowed, false);
  const advanceSql = "select public.advance_call_session($1,$2,$3,$4,$5,$6,$7) as result";
  const cancelId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const cancelled = (await db.query(advanceSql, [newCall, thread, actor, started.capability, cancelId, "cancel", "b".repeat(64)])).rows[0].result;
  check(cancelled.replayed, false);
  check((await db.query("select state from call_sessions where id=$1", [newCall])).rows[0].state, "cancelled");
  const cancelReplay = (await db.query(advanceSql, [newCall, thread, actor, started.capability, cancelId, "cancel", "b".repeat(64)])).rows[0].result;
  check(cancelReplay.replayed, true);
  await denied(advanceSql, "55000", [newCall, thread, peer, started.capability, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "accept", "c".repeat(64)]);
  await denied(beginSql, "PT409", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", thread, actor, "ffffffff-ffff-4fff-8fff-ffffffffffff", "d".repeat(64)]);

  await db.query("update pokes set responded_at=now() where thread_id=$1", [thread]);
  const editSql = "select public.mutate_dm_message_idempotent($1,$2,$3,$4,$5,$6,$7,$8,$9) as result";
  const editArgs = [actor, thread, sent.message.id, "edit", "Edited before expiry", "dm_message:edit", "edit-before-expiry", "e".repeat(64), "fixture-request"];
  const edited = (await db.query(editSql, editArgs)).rows[0].result;
  check(edited.response_status, 200);
  check(edited.replayed, false);
  await db.query("update pokes set responded_at=now()-interval '24 hours' where thread_id=$1", [thread]);
  const editReplay = (await db.query(editSql, editArgs)).rows[0].result;
  check(editReplay.replayed, true);
  check(editReplay.response_body, edited.response_body);
  await denied(editSql, "PT409", [actor, thread, sent.message.id, "edit", "New expired edit", "dm_message:edit", "edit-after-expiry", "f".repeat(64), "fixture-request"]);
  check((await db.query("select count(*)::int count from idempotency_records where key='edit-after-expiry'")).rows[0].count, 0);
  const deleted = (await db.query(editSql, [actor, thread, sent.message.id, "delete", null, "dm_message:delete", "delete-after-expiry", "a".repeat(64), "fixture-request"])).rows[0].result;
  check(deleted.response_status, 200);
  check(deleted.response_body.message.is_deleted, true);
  console.log(`Temporary conversation database guards: ${assertions} assertions passed.`);
} finally { await db.close(); }
