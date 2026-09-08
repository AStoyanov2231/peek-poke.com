import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withLocalPostgres } from "./local-postgres.mjs";
import { actor, peer, thread, lifecycleFixtureSql, rpcFixtureSql, rpcDefinitions } from "./temporary-conversation-fixture.mjs";

const migration = await readFile(new URL("../../supabase/migrations/20260908221806_temporary_poke_conversations.sql", import.meta.url), "utf8");
const first = "99999999-9999-4999-8999-999999999999";
const second = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const send = (id, content) => `select 'RESULT:'||public.send_message_transactional('${thread}','${actor}','${id}','${content}')::text;`;
let cases = 0;
await withLocalPostgres(async ({ query, session, until, blockedBy }) => {
  await query(lifecycleFixtureSql + rpcFixtureSql + rpcDefinitions + migration);
  await query("update public.call_sessions set state='ended';");
  async function lockedThread() {
    const holder = session(`begin; select id from public.dm_threads where id='${thread}' for update; select 'LOCKED';`);
    const pid = await holder.pid();
    await until("thread lock acquired", () => holder.out.includes("LOCKED"));
    return { holder, pid };
  }
  async function finish(holder) { holder.finish(); assert.equal(await holder.wait(), 0, holder.err); }
  async function expectExpired(writer) {
    writer.finish();
    assert.notEqual(await writer.wait(), 0);
    assert.match(writer.err, /PT409: POKE_CONVERSATION_EXPIRED/);
    cases += 1;
  }

  // Statement/transaction time predates expiry, but authorization uses the clock
  // at insertion after the thread lock is released.
  const expiry = await lockedThread();
  await query(`update public.pokes set responded_at=clock_timestamp()-interval '24 hours'+interval '2 seconds' where thread_id='${thread}';`);
  const expiredWriter = session(`begin; select now(); ${send(first, "Must not send")}`);
  await blockedBy(await expiredWriter.pid(), expiry.pid);
  await until("conversation clock deadline", async () => (await query(`select clock_timestamp()>app_private.dm_conversation_expires_at_v1('${thread}')`)) === "t");
  await finish(expiry.holder);
  await expectExpired(expiredWriter);
  assert.equal(await query(`select next_message_sequence from dm_threads where id='${thread}'`), "0");
  assert.equal(await query("select count(*) from outbox_events"), "0");

  // Two same-key copies overlap at the actual thread lock and commit one event.
  await query(`update public.pokes set responded_at=now() where thread_id='${thread}'`);
  const original = session(`begin; ${send(first, "One durable message")} select 'SENT';`);
  const originalPid = await original.pid();
  await until("first message held before commit", () => original.out.includes("SENT"));
  const duplicate = session(`begin; ${send(first, "One durable message")}`);
  await blockedBy(await duplicate.pid(), originalPid);
  await finish(original);
  duplicate.finish();
  assert.equal(await duplicate.wait(), 0, duplicate.err);
  assert.match(duplicate.out, /"deduplicated": true/);
  assert.equal(await query("select count(*) from outbox_events where event_type='message.changed'"), "1");
  assert.equal(await query(`select next_message_sequence from dm_threads where id='${thread}'`), "1");
  cases += 1;

  // Renewal committed while a writer waits must be visible to its guard.
  await query(`update public.pokes set responded_at=now()-interval '25 hours' where thread_id='${thread}'`);
  const renewal = await lockedThread();
  const renewedWriter = session(`begin; ${send(second, "Renewed while waiting")}`);
  await blockedBy(await renewedWriter.pid(), renewal.pid);
  renewal.holder.write(`update public.pokes set responded_at=now() where thread_id='${thread}';`);
  await finish(renewal.holder);
  renewedWriter.finish();
  assert.equal(await renewedWriter.wait(), 0, renewedWriter.err);
  assert.match(renewedWriter.out, /"deduplicated": false/);
  cases += 1;

  // A removed friendship cannot extend an already-expired Poke while waiting.
  await query(`update public.pokes set responded_at=now()-interval '25 hours'; insert into public.friendships values('${actor}','${peer}','accepted');`);
  const removal = await lockedThread();
  const removedWriter = session(`begin; ${send("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Friendship revoked")}`);
  await blockedBy(await removedWriter.pid(), removal.pid);
  removal.holder.write("delete from public.friendships;");
  await finish(removal.holder);
  await expectExpired(removedWriter);
  assert.equal(await query("select count(*) from outbox_events where event_type='message.changed'"), "2");
  assert.equal(await query(`select next_message_sequence from dm_threads where id='${thread}'`), "2");
});
console.log(`Temporary conversations: ${cases} PostgreSQL 17 concurrency cases passed; server and sessions cleaned up.`);
