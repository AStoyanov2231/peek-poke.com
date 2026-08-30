begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'friend-idem-actor@test.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'friend-idem-target@test.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'friend-idem-other@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'friend_idem_actor'),
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'friend_idem_target'),
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'friend_idem_other');

insert into public.user_coins (user_id, balance)
values ('10000000-0000-4000-8000-000000000001', 5);

create temporary table friend_request_test_results (
  name text primary key,
  result jsonb not null
);

insert into friend_request_test_results (name, result)
values (
  'first',
  public.send_friend_request_idempotent(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'friend_request:create',
    'friend-idem-key-000001',
    repeat('a', 64),
    'friend-idem-request-000001'
  )
);

select is((select result ->> 'response_status' from friend_request_test_results where name = 'first'), '200', 'first execution succeeds');
select is((select result ->> 'replayed' from friend_request_test_results where name = 'first'), 'false', 'first execution is not replayed');
select is((select result #>> '{response_body,balance}' from friend_request_test_results where name = 'first'), '4', 'first execution spends one coin');
select is((select count(*) from public.friendships where requester_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'first execution creates one friendship');
select is((select count(*) from public.coin_transactions where user_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'first execution creates one coin transaction');
select is((select count(*) from public.outbox_events where event_type = 'friendship.requested'), 1::bigint, 'first execution creates one notification event');

insert into friend_request_test_results (name, result)
values (
  'replay',
  public.send_friend_request_idempotent(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'friend_request:create',
    'friend-idem-key-000001',
    repeat('a', 64),
    'friend-idem-request-lost-response'
  )
);

select is((select result ->> 'response_status' from friend_request_test_results where name = 'replay'), '200', 'same key and hash replays status');
select is((select result ->> 'replayed' from friend_request_test_results where name = 'replay'), 'true', 'same key and hash is marked replayed');
select is(
  (select result -> 'response_body' from friend_request_test_results where name = 'replay'),
  (select result -> 'response_body' from friend_request_test_results where name = 'first'),
  'lost-response retry replays the exact body'
);
select is((select count(*) from public.coin_transactions where user_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'replay does not spend another coin');
select is((select count(*) from public.outbox_events where event_type = 'friendship.requested'), 1::bigint, 'replay does not create another notification');

insert into friend_request_test_results (name, result)
values (
  'collision',
  public.send_friend_request_idempotent(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'friend_request:create',
    'friend-idem-key-000001',
    repeat('b', 64),
    'friend-idem-request-000002'
  )
);

select is((select result ->> 'response_status' from friend_request_test_results where name = 'collision'), '409', 'same key with a different hash conflicts');
select is((select result #>> '{response_body,code}' from friend_request_test_results where name = 'collision'), 'IDEMPOTENCY_KEY_REUSED', 'hash collision has the canonical code');
select is((select count(*) from public.coin_transactions where user_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'hash collision does not spend a coin');

select lives_ok(
  $$insert into public.idempotency_records (actor_id, operation, key, request_hash)
    values ('10000000-0000-4000-8000-000000000003', 'friend_request:create', 'friend-idem-key-000001', repeat('c', 64))$$,
  'the same operation and key are isolated by actor'
);
select lives_ok(
  $$insert into public.idempotency_records (actor_id, operation, key, request_hash)
    values ('10000000-0000-4000-8000-000000000001', 'friend_request:future-operation', 'friend-idem-key-000001', repeat('d', 64))$$,
  'the same actor and key are isolated by operation'
);

select ok(
  not exists (
    select 1 from information_schema.routine_privileges privilege
    where privilege.specific_schema = 'public'
      and privilege.routine_name = 'send_friend_request_idempotent'
      and privilege.grantee = 'PUBLIC'
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the RPC'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.send_friend_request_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'anon cannot execute the RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.send_friend_request_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'authenticated cannot execute the RPC'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.send_friend_request_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'service_role can execute the RPC'
);
select is((select count(*) from public.idempotency_records where key = 'friend-idem-key-000001'), 3::bigint, 'actor and operation scopes keep independent records');

select * from finish();
rollback;
