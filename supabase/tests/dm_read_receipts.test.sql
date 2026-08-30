begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email)
values
  ('50000000-0000-4000-8000-000000000001', 'dm-read-a@test.invalid'),
  ('50000000-0000-4000-8000-000000000002', 'dm-read-b@test.invalid'),
  ('50000000-0000-4000-8000-000000000003', 'dm-read-outsider@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'dm_read_a'),
  ('50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'dm_read_b'),
  ('50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'dm_read_outsider');

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values (
  '51000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002'
);

select has_table('public', 'dm_thread_members', 'durable read cursor table exists');
select has_pk(
  'public',
  'dm_thread_members',
  'thread and user cursor ownership has a primary key'
);
select has_trigger(
  'public',
  'dm_thread_members',
  'enforce_dm_thread_member_invariant_before_write',
  'cursor writes enforce participant and sequence ownership'
);
select has_trigger(
  'public',
  'dm_threads',
  'enforce_dm_thread_participants_before_write',
  'thread participant ownership cannot drift after cursor creation'
);
select has_trigger(
  'public',
  'dm_threads',
  'add_dm_thread_members_after_insert',
  'new threads create both participant cursors'
);
select is(
  (select count(*) from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000001'),
  2::bigint,
  'a new thread has exactly two cursor rows'
);
select is(
  (select count(*) from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000001' and last_read_sequence = 0),
  2::bigint,
  'new cursor rows begin at the actual empty-thread sequence'
);

update public.dm_threads
set next_message_sequence = 5
where id = '51000000-0000-4000-8000-000000000001';
update public.dm_thread_members
set last_read_sequence = 1
where thread_id = '51000000-0000-4000-8000-000000000001'
  and user_id = '50000000-0000-4000-8000-000000000001';

create temporary table dm_read_test_results (
  name text primary key,
  result jsonb not null
);

insert into dm_read_test_results (name, result)
values (
  'first',
  public.mark_thread_read_sequence(
    '51000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  )
);

select is((select result ->> 'success' from dm_read_test_results where name = 'first'), 'true', 'member read succeeds');
select is((select result ->> 'last_read_sequence' from dm_read_test_results where name = 'first'), '5', 'response returns the durable thread sequence');
select is(
  (select last_read_sequence from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000001' and user_id = '50000000-0000-4000-8000-000000000001'),
  5::bigint,
  'member cursor advances transactionally'
);
select is(
  (select count(*) from public.outbox_events where aggregate_id = '51000000-0000-4000-8000-000000000001' and payload ->> 'action' = 'read'),
  1::bigint,
  'a real cursor advance emits one read hint'
);

insert into dm_read_test_results (name, result)
values (
  'retry',
  public.mark_thread_read_sequence(
    '51000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  )
);

select is(
  (select result from dm_read_test_results where name = 'retry'),
  (select result from dm_read_test_results where name = 'first'),
  'a lost-response retry returns the exact durable result'
);
select is(
  (select count(*) from public.outbox_events where aggregate_id = '51000000-0000-4000-8000-000000000001' and payload ->> 'action' = 'read'),
  1::bigint,
  'a no-op retry emits no duplicate read hint'
);
select is(
  public.mark_thread_read_sequence(
    '51000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003'
  ) ->> 'error',
  'THREAD_NOT_FOUND',
  'a nonparticipant cannot mutate or discover the thread'
);
select throws_ok(
  $$insert into public.dm_thread_members (thread_id, user_id, last_read_sequence)
    values ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 0)$$,
  '23503',
  null,
  'a nonparticipant cursor row is rejected'
);
select throws_ok(
  $$update public.dm_thread_members
    set last_read_sequence = 6
    where thread_id = '51000000-0000-4000-8000-000000000001'
      and user_id = '50000000-0000-4000-8000-000000000002'$$,
  '23514',
  null,
  'a cursor cannot advance beyond the durable thread sequence'
);
select throws_ok(
  $$update public.dm_threads
    set participant_2_id = '50000000-0000-4000-8000-000000000003'
    where id = '51000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'thread participants cannot drift away from durable cursor ownership'
);

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values (
  '51000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002'
);

do $messages$
begin
  perform public.send_message_transactional(
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'own message one'
  );
  perform public.send_message_transactional(
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000002',
    'incoming message two'
  );
  perform public.send_message_transactional(
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000003',
    'incoming message three'
  );
  perform public.send_message_transactional(
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000004',
    'incoming message four'
  );
end;
$messages$;

update public.dm_messages
set is_read = true
where thread_id = '51000000-0000-4000-8000-000000000002'
  and sequence in (1, 2);
update public.dm_thread_members
set
  last_read_sequence = case
    when user_id = '50000000-0000-4000-8000-000000000001' then 0
    else 3
  end,
  updated_at = '2026-01-01 00:00:00+00'
where thread_id = '51000000-0000-4000-8000-000000000002';

do $repair$
begin
  perform public.repair_dm_thread_member_cursors('51000000-0000-4000-8000-000000000002');
end;
$repair$;

select is(
  (select last_read_sequence from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000002' and user_id = '50000000-0000-4000-8000-000000000001'),
  3::bigint,
  'a non-null zero cursor advances to the safe incoming-message prefix while own messages are ignored'
);
select is(
  (select last_read_sequence from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000002' and user_id = '50000000-0000-4000-8000-000000000002'),
  3::bigint,
  'an existing cursor greater than the derived safe prefix is preserved'
);
select ok(
  (select updated_at > '2026-01-01 00:00:00+00' from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000002' and user_id = '50000000-0000-4000-8000-000000000001'),
  'the timestamp advances with a real cursor advance'
);
select is(
  (select updated_at from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000002' and user_id = '50000000-0000-4000-8000-000000000002'),
  '2026-01-01 00:00:00+00'::timestamptz,
  'a preserved greater cursor does not receive a fake timestamp update'
);
select is(
  (select count(*) from public.outbox_events where aggregate_id = '51000000-0000-4000-8000-000000000002' and payload ->> 'action' = 'read'),
  0::bigint,
  'cursor repair emits no read outbox or broadcast hint'
);

alter table public.dm_thread_members alter column last_read_sequence drop not null;
update public.dm_thread_members
set last_read_sequence = null
where thread_id = '51000000-0000-4000-8000-000000000002'
  and user_id = '50000000-0000-4000-8000-000000000001';
do $null_repair$
begin
  perform public.repair_dm_thread_member_cursors('51000000-0000-4000-8000-000000000002');
end;
$null_repair$;
select is(
  (select last_read_sequence from public.dm_thread_members where thread_id = '51000000-0000-4000-8000-000000000002' and user_id = '50000000-0000-4000-8000-000000000001'),
  3::bigint,
  'a null partial-rollout cursor is repaired from message history'
);
alter table public.dm_thread_members alter column last_read_sequence set not null;

select throws_ok(
  $$update public.dm_thread_members
    set last_read_sequence = -1
    where thread_id = '51000000-0000-4000-8000-000000000002'
      and user_id = '50000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a negative existing cursor is rejected fail closed'
);

alter table public.dm_thread_members disable trigger enforce_dm_thread_member_invariant_before_write;
update public.dm_thread_members
set last_read_sequence = 5
where thread_id = '51000000-0000-4000-8000-000000000002'
  and user_id = '50000000-0000-4000-8000-000000000002';
alter table public.dm_thread_members enable trigger enforce_dm_thread_member_invariant_before_write;
select throws_ok(
  $$select public.repair_dm_thread_member_cursors('51000000-0000-4000-8000-000000000002')$$,
  '23514',
  null,
  'repair rejects an existing cursor ahead of the real thread sequence'
);
update public.dm_thread_members
set last_read_sequence = 3
where thread_id = '51000000-0000-4000-8000-000000000002'
  and user_id = '50000000-0000-4000-8000-000000000002';

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.repair_dm_thread_member_cursors(uuid)', 'EXECUTE'),
  'anon cannot execute cursor repair'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.repair_dm_thread_member_cursors(uuid)', 'EXECUTE'),
  'service_role can execute cursor repair'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.mark_thread_read_sequence(uuid,uuid)', 'EXECUTE'),
  'anon cannot execute the read RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.mark_thread_read_sequence(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot execute the read RPC'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.mark_thread_read_sequence(uuid,uuid)', 'EXECUTE'),
  'service_role can execute the read RPC'
);

select * from finish();
rollback;
