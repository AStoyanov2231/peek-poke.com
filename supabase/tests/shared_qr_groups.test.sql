begin;

create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, email)
values
  ('57000000-0000-4000-8000-000000000001', 'qr-group-a@test.invalid'),
  ('57000000-0000-4000-8000-000000000002', 'qr-group-b@test.invalid'),
  ('57000000-0000-4000-8000-000000000003', 'qr-group-outsider@test.invalid'),
  ('57000000-0000-4000-8000-000000000004', 'qr-group-late@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'qr_group_a'),
  ('57000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', 'qr_group_b'),
  ('57000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000003', 'qr_group_outsider'),
  ('57000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000004', 'qr_group_late');

create temporary table shared_qr_test_state (
  name text primary key,
  result jsonb not null
);

insert into shared_qr_test_state (name, result)
values
  ('first', public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000001',
    '  https://coffee.example/table?id=7  '
  )),
  ('rescan', public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000001',
    '  https://coffee.example/table?id=7  '
  )),
  ('second', public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000002',
    '  https://coffee.example/table?id=7  '
  )),
  ('different', public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000003',
    'coffee-table-8'
  ));

select has_table('public', 'shared_groups', 'shared group table exists');
select has_table('public', 'shared_group_members', 'shared group membership table exists');
select has_table('public', 'shared_group_messages', 'shared group message table exists');
select has_pk('public', 'shared_group_members', 'group membership is unique per user');
select has_pk('public', 'shared_group_messages', 'messages have a primary key');
select is(
  (select count(*) from public.shared_groups),
  2::bigint,
  'same exact QR text and a different QR text produce two groups'
);
select is(
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first'),
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'rescan'),
  'same user rescan returns the original group'
);
select is(
  (select result ->> 'is_new_group' from shared_qr_test_state where name = 'rescan'),
  'false',
  'same user rescan does not create a group'
);
select is(
  (select result ->> 'is_new_member' from shared_qr_test_state where name = 'rescan'),
  'false',
  'same user rescan does not duplicate membership'
);
select is(
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first'),
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'second'),
  'the second user joins the exact same QR group'
);
select is(
  (select result ->> 'is_new_member' from shared_qr_test_state where name = 'second'),
  'true',
  'the second user creates one membership'
);
select is(
  (select (result -> 'group' ->> 'member_count')::integer from shared_qr_test_state where name = 'second'),
  2,
  'same QR group reports both members'
);
select is(
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first') <> (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'different'),
  true,
  'different QR text cannot collapse into the same group'
);
select is(
  (select count(*) from public.shared_group_members),
  3::bigint,
  'membership rows are one per group and user'
);
select is(
  (select result ->> 'error' from public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000003',
    ''
  )),
  'INVALID_QR_CONTENT',
  'empty QR text is rejected'
);

insert into shared_qr_test_state (name, result)
values (
  'sent', public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    'hello from A'
  )
), (
  'replay', public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    'hello from A'
  )
), (
  'outsider-send', public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000003',
    '58000000-0000-4000-8000-000000000003',
    'must not enter'
  )
);

insert into shared_qr_test_state (name, result)
values (
  'late-join', public.create_or_join_shared_group(
    '57000000-0000-4000-8000-000000000004',
    '  https://coffee.example/table?id=7  '
  )
);

select is(
  (select (result -> 'group' ->> 'unread_count')::integer from shared_qr_test_state where name = 'late-join'),
  1,
  'a new member receives the existing history as unread'
);
select is(
  (select result -> 'message' ->> 'id' from shared_qr_test_state where name = 'sent'),
  (select result -> 'message' ->> 'id' from shared_qr_test_state where name = 'replay'),
  'replaying the same message client ID returns one message'
);
select is(
  (select result ->> 'deduplicated' from shared_qr_test_state where name = 'replay'),
  'true',
  'message replay is explicitly marked deduplicated'
);
select is(
  (select result ->> 'error' from shared_qr_test_state where name = 'outsider-send'),
  'GROUP_NOT_FOUND',
  'a nonmember cannot send to a guessed group'
);
select is(
  (select count(*) from public.shared_group_messages),
  1::bigint,
  'only the authorized first message was stored'
);
select is(
  (select sequence from public.shared_group_messages),
  1::bigint,
  'the first authorized message receives sequence one'
);
select is(
  (select result -> 'message' ->> 'thread_id' from shared_qr_test_state where name = 'sent'),
  (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first'),
  'group messages return their group as the conversation ID'
);
select is(
  (select result ->> 'error' from public.mark_shared_group_read(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000003'
  )),
  'GROUP_NOT_FOUND',
  'a nonmember cannot mark a guessed group read'
);
select is(
  (select (public.mark_shared_group_read(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000002'
  ) ->> 'last_read_sequence')::bigint),
  1::bigint,
  'a member can advance only their own read cursor'
);
select is(
  (select last_read_sequence from public.shared_group_members
   where group_id = (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first')
   and user_id = '57000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the member read cursor is durable'
);
select is(
  (select count(*) from public.outbox_events
   where event_type = 'shared_group.message.changed'
   and aggregate_id = (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first')),
  2::bigint,
  'a stored group message and read update emit shared group outbox hints'
);
select is(
  (select count(*) from public.outbox_events
   where event_type = 'shared_group.message.changed'
   and aggregate_id = (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first')
   and payload ->> 'action' = 'read'),
  1::bigint,
  'a member read update emits a shared group read hint'
);
select is(
  (select payload -> 'recipient_ids'
   from public.outbox_events
   where event_type = 'shared_group.message.changed'
     and aggregate_id = (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first')
     and payload ->> 'action' = 'sent'),
  pg_catalog.jsonb_build_array(
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000002'
  ),
  'the message outbox snapshots recipients at send time'
);
select is(
  (select result ->> 'error' from public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000001',
    'different body'
  )),
  'IDEMPOTENCY_KEY_REUSED',
  'reusing a message key with different content is rejected'
);

insert into shared_qr_test_state (name, result)
values (
  'second-sent', public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000002',
    '58000000-0000-4000-8000-000000000002',
    'hello from B before erasure'
  )
);

select is(
  (public.erase_account_data('57000000-0000-4000-8000-000000000001') ->> 'success')::boolean,
  true,
  'account erasure succeeds for a shared-group member'
);
select is(
  (select count(*) from public.shared_group_messages
   where sender_id = '57000000-0000-4000-8000-000000000001'),
  0::bigint,
  'account erasure removes the deleted member messages'
);
select is(
  (select count(*) from public.shared_group_members
   where group_id = (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first')),
  2::bigint,
  'account erasure removes only the deleted member membership'
);
select is(
  (select (public.get_shared_groups('57000000-0000-4000-8000-000000000002') -> 0 ->> 'member_count')::integer),
  2,
  'the remaining members still see the group with its updated count'
);
select is(
  (select payload -> 'recipient_ids'
   from public.outbox_events
   where event_type = 'shared_group.message.changed'
     and payload ->> 'message_id' = (select result -> 'message' ->> 'id' from shared_qr_test_state where name = 'second-sent')),
  pg_catalog.jsonb_build_array(
    '57000000-0000-4000-8000-000000000002',
    '57000000-0000-4000-8000-000000000004'
  ),
  'account erasure scrubs the deleted recipient from pending hints'
);
select is(
  (select payload -> 'recipient_ids'
   from public.outbox_events
   where event_type = 'shared_group.message.changed'
     and aggregate_id = (select result -> 'group' ->> 'id' from shared_qr_test_state where name = 'first')
     and payload ->> 'action' = 'deleted'),
  pg_catalog.jsonb_build_array(
    '57000000-0000-4000-8000-000000000002',
    '57000000-0000-4000-8000-000000000004'
  ),
  'account erasure emits a sanitized shared-group deletion hint'
);
select is(
  (select result ->> 'error' from public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000001',
    '58000000-0000-4000-8000-000000000003',
    'deleted member cannot send'
  )),
  'GROUP_NOT_FOUND',
  'the deleted member loses shared-group access'
);
select is(
  (public.send_shared_group_message_transactional(
    (select (result -> 'group' ->> 'id')::uuid from shared_qr_test_state where name = 'first'),
    '57000000-0000-4000-8000-000000000002',
    '58000000-0000-4000-8000-000000000003',
    'hello from B after erasure'
  ) ->> 'deduplicated')::boolean,
  false,
  'the remaining member can continue messaging'
);
select is(
  (select count(*) from public.shared_group_messages),
  2::bigint,
  'remaining member data is preserved after account erasure'
);

select * from finish();
rollback;
