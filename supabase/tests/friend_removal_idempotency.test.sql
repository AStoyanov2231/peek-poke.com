begin;

create extension if not exists pgtap with schema extensions;
select plan(81);

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000001', 'friend-remove-actor@test.invalid'),
  ('20000000-0000-4000-8000-000000000002', 'friend-remove-target@test.invalid'),
  ('20000000-0000-4000-8000-000000000003', 'friend-remove-other@test.invalid'),
  ('20000000-0000-4000-8000-000000000004', 'refund-owner@test.invalid'),
  ('20000000-0000-4000-8000-000000000005', 'refund-recipient@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'friend_remove_actor'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'friend_remove_target'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'friend_remove_other'),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'refund_owner'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'refund_recipient');

insert into public.user_coins (user_id, balance)
values
  ('20000000-0000-4000-8000-000000000001', 4),
  ('20000000-0000-4000-8000-000000000004', 4);

insert into public.friendships (id, requester_id, addressee_id, status)
values (
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'pending'
);

create temporary table friend_removal_results (
  name text primary key,
  result jsonb not null
);

insert into friend_removal_results (name, result)
values (
  'first',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    'friendship:remove',
    'friend-removal-key-000001',
    repeat('a', 64),
    'friend-removal-request-000001'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'first'), '200', 'first removal succeeds');
select is((select result ->> 'replayed' from friend_removal_results where name = 'first'), 'false', 'first removal is not a replay');
select is((select result #>> '{response_body,refunded}' from friend_removal_results where name = 'first'), 'true', 'requester cancellation is refunded');
select is((select result #>> '{response_body,balance}' from friend_removal_results where name = 'first'), '5', 'refund returns the locked wallet balance');
select is((select count(*) from public.friendships where id = '20000000-0000-4000-8000-000000000010'), 0::bigint, 'friendship is deleted');
select is((select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000010'), 1::bigint, 'one refund claim is durable');
select is((select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'one refund ledger row is written');
select is((select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000010'), 1::bigint, 'one removal event is durable');

insert into friend_removal_results (name, result)
values (
  'replay',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    'friendship:remove',
    'friend-removal-key-000001',
    repeat('a', 64),
    'friend-removal-request-lost-response'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'replay'), '200', 'same key replays status');
select is((select result ->> 'replayed' from friend_removal_results where name = 'replay'), 'true', 'same key is marked replayed');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'replay'),
  (select result -> 'response_body' from friend_removal_results where name = 'first'),
  'lost-response retry replays the exact body'
);
select is((select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'replay does not duplicate ledger');
select is((select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000010'), 1::bigint, 'replay does not duplicate outbox');

insert into friend_removal_results (name, result)
values (
  'collision',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    'friendship:remove',
    'friend-removal-key-000001',
    repeat('b', 64),
    'friend-removal-request-000002'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'collision'), '409', 'same key with another hash conflicts');
select is((select result #>> '{response_body,code}' from friend_removal_results where name = 'collision'), 'IDEMPOTENCY_KEY_REUSED', 'hash conflict has canonical code');

insert into friend_removal_results (name, result)
values (
  'different-key',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    'friendship:remove',
    'friend-removal-key-000002',
    repeat('c', 64),
    'friend-removal-request-000003'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'different-key'), '404', 'different key observes already-removed state');
select is((select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'different key cannot duplicate refund');

update public.user_coins set balance = 4 where user_id = '20000000-0000-4000-8000-000000000001';
insert into public.friendships (id, requester_id, addressee_id, status)
values (
  '20000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003',
  'pending'
);

insert into friend_removal_results (name, result)
values (
  'block-first',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'user:block',
    'block-idempotency-key-000001',
    repeat('e', 64),
    'block-request-000001'
  )
);

select is(
  (select result ->> 'response_status' from friend_removal_results where name = 'block-first'),
  '200',
  'block path succeeds through the shared removal core'
);
select is((select result #>> '{response_body,refunded}' from friend_removal_results where name = 'block-first'), 'true', 'block returns the pending-request refund');
select is((select result #>> '{response_body,balance}' from friend_removal_results where name = 'block-first'), '5', 'block returns the exact refunded wallet balance');

insert into friend_removal_results (name, result)
values (
  'block-replay',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'user:block',
    'block-idempotency-key-000001',
    repeat('e', 64),
    'block-request-lost-response'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-replay'), '200', 'lost block response replays status');
select is((select result ->> 'replayed' from friend_removal_results where name = 'block-replay'), 'true', 'same block key is marked replayed');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'block-replay'),
  (select result -> 'response_body' from friend_removal_results where name = 'block-first'),
  'lost block response replays refund and balance exactly'
);
select is((select count(*) from public.outbox_events where event_type = 'user.blocked' and payload ->> 'addressee_id' = '20000000-0000-4000-8000-000000000003'), 1::bigint, 'block retry emits one durable convergence event');

insert into friend_removal_results (name, result)
values (
  'block-collision',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'user:block',
    'block-idempotency-key-000001',
    repeat('f', 64),
    'block-request-collision'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-collision'), '409', 'same block key with another hash conflicts');

insert into friend_removal_results (name, result)
values (
  'block-different-key',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'user:block',
    'block-idempotency-key-000002',
    repeat('f', 64),
    'block-request-different-key'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-different-key'), '200', 'different block key observes already-blocked success');
select is((select result #>> '{response_body,refunded}' from friend_removal_results where name = 'block-different-key'), 'false', 'different block key cannot replay a refund it does not own');
select is((select count(*) from public.outbox_events where event_type = 'user.blocked' and payload ->> 'addressee_id' = '20000000-0000-4000-8000-000000000003'), 1::bigint, 'different block key cannot duplicate the block event');

insert into friend_removal_results (name, result)
values (
  'after-block',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000011',
    'friendship:remove',
    'friend-removal-key-000003',
    repeat('d', 64),
    'friend-removal-request-000004'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'after-block'), '404', 'DELETE after block observes the shared winner');
select is((select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000011'), 1::bigint, 'block and DELETE share one refund claim');
select is((select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000001'), 2::bigint, 'block race adds only one ledger row for the second friendship');
select is((select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000011'), 1::bigint, 'block race adds one removal event');

update public.friendship_mutation_rate_limits
set request_count = 19,
    window_started_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
where actor_id = '20000000-0000-4000-8000-000000000001'
  and operation = 'user:block';

insert into friend_removal_results (name, result)
values (
  'block-rate-boundary',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'user:block',
    'block-rate-boundary-key-020',
    repeat('1', 64),
    'block-rate-boundary-request'
  )
);
insert into friend_removal_results (name, result)
values (
  'block-rate-overflow',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'user:block',
    'block-rate-boundary-key-021',
    repeat('2', 64),
    'block-rate-overflow-request'
  )
);
insert into friend_removal_results (name, result)
values (
  'block-rate-replay',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'user:block',
    'block-rate-boundary-key-021',
    repeat('2', 64),
    'block-rate-overflow-replay'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'block-rate-boundary'), '200', 'twentieth unique block key wins the rate boundary');
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-rate-overflow'), '429', 'twenty-first unique block key is rate limited');
select ok((select (result ->> 'retry_after_seconds')::integer between 1 and 86400 from friend_removal_results where name = 'block-rate-overflow'), 'rate-limit response stores a bounded Retry-After');
select is((select result ->> 'replayed' from friend_removal_results where name = 'block-rate-replay'), 'false', 'rate-limited same key stays deliberately unclaimed');
select is(
  (select result - 'replayed' from friend_removal_results where name = 'block-rate-replay'),
  (select result - 'replayed' from friend_removal_results where name = 'block-rate-overflow'),
  'rate-limit replay preserves exact body and Retry-After'
);
select is(
  (select count(*) from public.idempotency_records where actor_id = '20000000-0000-4000-8000-000000000001' and operation = 'user:block' and key = 'block-rate-boundary-key-021'),
  0::bigint,
  'denied block key creates no durable claim'
);

update public.friendship_mutation_rate_limits
set window_started_at = pg_catalog.clock_timestamp() - interval '86401 seconds'
where actor_id = '20000000-0000-4000-8000-000000000001'
  and operation = 'user:block';

insert into friend_removal_results (name, result)
values (
  'block-rate-rollover',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'user:block',
    'block-rate-boundary-key-021',
    repeat('3', 64),
    'block-rate-rollover-request'
  )
);
insert into friend_removal_results (name, result)
values (
  'block-rate-rollover-conflict',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'user:block',
    'block-rate-boundary-key-021',
    repeat('4', 64),
    'block-rate-rollover-conflict'
  )
);
insert into friend_removal_results (name, result)
values (
  'block-other-actor',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'user:block',
    'block-other-actor-key-0001',
    repeat('5', 64),
    'block-other-actor-request'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'block-rate-rollover'), '200', 'denied key is reusable after window rollover');
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-rate-rollover-conflict'), '409', 'claimed rollover key is bound to its target hash');
select is((select result #>> '{response_body,code}' from friend_removal_results where name = 'block-rate-rollover-conflict'), 'IDEMPOTENCY_KEY_REUSED', 'claimed target conflict has canonical code');
select is((select result ->> 'response_status' from friend_removal_results where name = 'block-other-actor'), '200', 'another actor has an independent block window');
select is((select count(*) from public.friendship_mutation_rate_limits where operation = 'user:block'), 2::bigint, 'block limiter keeps one bucket per actor');

-- The addressee can win the pair lock first. The immutable requester still
-- receives the one refund, while the winner's public response stays neutral.
insert into public.friendships (id, requester_id, addressee_id, status)
values (
  '20000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  'pending'
);

insert into friend_removal_results (name, result)
values (
  'recipient-block-winner',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000004',
    'user:block',
    'recipient-block-winner-key-0001',
    repeat('6', 64),
    'recipient-block-winner-request'
  )
);

select is((select result ->> 'response_status' from friend_removal_results where name = 'recipient-block-winner'), '200', 'addressee block can win the pending pair lock');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'recipient-block-winner'),
  pg_catalog.jsonb_build_object('success', true, 'refunded', false, 'balance', null),
  'addressee winner receives the exact neutral public DTO'
);
select is((select result ->> 'replayed' from friend_removal_results where name = 'recipient-block-winner'), 'false', 'addressee winner is not initially replayed');
select is((select balance from public.user_coins where user_id = '20000000-0000-4000-8000-000000000004'), 5, 'immutable requester wallet receives the refund');
select is((select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000012'), 1::bigint, 'recipient winner creates exactly one refund claim');
select ok(
  exists (
    select 1
    from public.friendship_refunds
    where friendship_id = '20000000-0000-4000-8000-000000000012'
      and requester_id = '20000000-0000-4000-8000-000000000004'
      and addressee_id = '20000000-0000-4000-8000-000000000005'
      and source = 'block'
  ),
  'refund claim targets the immutable requester and records the winning path'
);
select is(
  (select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000004' and related_user_id = '20000000-0000-4000-8000-000000000005'),
  1::bigint,
  'recipient winner writes one requester-owned refund ledger row'
);
select is((select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012'), 1::bigint, 'recipient winner writes one removal outbox event');
select is(
  (select payload ->> 'refund_owner_id' from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012'),
  '20000000-0000-4000-8000-000000000004',
  'removal outbox targets the immutable refund owner'
);
select is(
  (select payload ->> 'refund_applied' from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012'),
  'true',
  'removal outbox records that the refund was applied'
);
select ok(
  (select not (payload ? 'balance') and not (payload ? 'amount') from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012'),
  'shared removal outbox exposes no requester balance or refund amount'
);

insert into friend_removal_results (name, result)
values (
  'recipient-block-replay',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000004',
    'user:block',
    'recipient-block-winner-key-0001',
    repeat('6', 64),
    'recipient-block-replay-request'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'recipient-block-replay'), '200', 'recipient same-key retry replays success');
select is((select result ->> 'replayed' from friend_removal_results where name = 'recipient-block-replay'), 'true', 'recipient same-key retry is marked replayed');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'recipient-block-replay'),
  (select result -> 'response_body' from friend_removal_results where name = 'recipient-block-winner'),
  'recipient same-key retry replays the exact private DTO'
);

insert into friend_removal_results (name, result)
values (
  'recipient-block-different-key',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000004',
    'user:block',
    'recipient-block-winner-key-0002',
    repeat('7', 64),
    'recipient-block-different-request'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'recipient-block-different-key'), '200', 'recipient different key observes the durable block');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'recipient-block-different-key'),
  pg_catalog.jsonb_build_object('success', true, 'refunded', false, 'balance', null),
  'recipient different key cannot observe requester refund data'
);

insert into friend_removal_results (name, result)
values (
  'requester-delete-after-recipient-block',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000012',
    'friendship:remove',
    'requester-after-block-key-0001',
    repeat('8', 64),
    'requester-after-block-request'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'requester-delete-after-recipient-block'), '404', 'requester DELETE observes the recipient block winner');
select is((select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000012'), 1::bigint, 'winner retries preserve one refund claim');
select is(
  (select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000004' and related_user_id = '20000000-0000-4000-8000-000000000005'),
  1::bigint,
  'winner retries preserve one requester ledger row'
);
select is((select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012'), 1::bigint, 'winner retries preserve one removal outbox event');
select is((select balance from public.user_coins where user_id = '20000000-0000-4000-8000-000000000004'), 5, 'winner retries preserve the one wallet refund');

insert into friend_removal_results (name, result)
values (
  'requester-reciprocal-block',
  public.block_user_idempotent(
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005',
    'user:block',
    'requester-reciprocal-key-0001',
    repeat('9', 64),
    'requester-reciprocal-request'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'requester-reciprocal-block'), '200', 'reciprocal block succeeds after recipient winner');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'requester-reciprocal-block'),
  pg_catalog.jsonb_build_object('success', true, 'refunded', false, 'balance', null),
  'reciprocal block cannot replay the prior requester refund'
);
select ok(
  (select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000012') = 1
    and (select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000004' and related_user_id = '20000000-0000-4000-8000-000000000005') = 1
    and (select count(*) from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000012') = 1,
  'reciprocal block preserves one claim, ledger row, and removal outbox event'
);

insert into public.friendships (id, requester_id, addressee_id, status)
values (
  '20000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000003',
  'accepted'
);
insert into friend_removal_results (name, result)
values (
  'accepted-delete',
  public.remove_friendship_idempotent(
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000013',
    'friendship:remove',
    'accepted-remove-key-0000001',
    repeat('a', 64),
    'accepted-remove-request'
  )
);
select is((select result ->> 'response_status' from friend_removal_results where name = 'accepted-delete'), '200', 'accepted friendship remains removable by either participant');
select is(
  (select result -> 'response_body' from friend_removal_results where name = 'accepted-delete'),
  pg_catalog.jsonb_build_object('success', true, 'refunded', false, 'balance', null),
  'accepted removal has the neutral no-cost response'
);
select is((select count(*) from public.friendship_refunds where friendship_id = '20000000-0000-4000-8000-000000000013'), 0::bigint, 'accepted removal creates no refund claim');
select is(
  (select count(*) from public.coin_transactions where reason = 'request_cancelled_refund' and user_id = '20000000-0000-4000-8000-000000000004' and related_user_id = '20000000-0000-4000-8000-000000000003'),
  0::bigint,
  'accepted removal creates no refund ledger row'
);
select ok(
  (select payload ->> 'refund_applied' = 'false' and payload -> 'refund_owner_id' = 'null'::jsonb from public.outbox_events where event_type = 'friendship.removed' and aggregate_id = '20000000-0000-4000-8000-000000000013'),
  'accepted removal outbox records no refund owner'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.remove_friendship_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'anon cannot execute removal RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.remove_friendship_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'authenticated cannot execute removal RPC'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.remove_friendship_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'service role can execute removal RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.block_user_with_friendship_fence(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot bypass the backend through fenced block RPC'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.block_user_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'anon cannot execute idempotent block RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.block_user_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'authenticated cannot execute idempotent block RPC'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.block_user_idempotent(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'service role can execute idempotent block RPC'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.block_user(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot bypass the backend through block_user'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.unfriend(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot bypass idempotent DELETE through unfriend'
);

select * from finish();
rollback;
