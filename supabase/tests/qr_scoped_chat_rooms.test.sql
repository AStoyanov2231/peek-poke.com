begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email)
values
  ('70000000-0000-4000-8000-000000000001', 'qr-room-a@test.invalid'),
  ('70000000-0000-4000-8000-000000000002', 'qr-room-b@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'qr_room_a'),
  ('70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'qr_room_b');

create temporary table qr_room_state as
select public.create_chat_room('70000000-0000-4000-8000-000000000001') as created;

select is(
  ((select created from qr_room_state)->>'room_id')::uuid is not null,
  true,
  'room creation returns an opaque room id'
);
select is(
  ((select created from qr_room_state)->>'qr_payload') ~ '^pp-room-v1\.[A-Za-z0-9_-]{43}$',
  true,
  'room creation returns a high-entropy versioned QR capability'
);
select is(
  (
    select count(*)
    from public.chat_room_members member
    where member.room_id = ((select created from qr_room_state)->>'room_id')::uuid
  ),
  1::bigint,
  'room creator is a member'
);

create temporary table qr_room_join_state as
select public.join_chat_room_by_qr(
  '70000000-0000-4000-8000-000000000002',
  (select created->>'qr_payload' from qr_room_state)
) as joined;

select is(
  ((select joined from qr_room_join_state)->>'is_new_member')::boolean,
  true,
  'a second authenticated user joins with the same QR capability'
);
select is(
  (select joined->>'room_id' from qr_room_join_state),
  (select created->>'room_id' from qr_room_state),
  'the shared QR capability resolves to one stable room'
);
select is(
  (public.join_chat_room_by_qr(
    '70000000-0000-4000-8000-000000000002',
    (select created->>'qr_payload' from qr_room_state)
  )->>'is_new_member')::boolean,
  false,
  'repeated scans are idempotent'
);
select is(
  (
    select room.qr_payload_hash
    from public.chat_rooms room
    where room.id = ((select created from qr_room_state)->>'room_id')::uuid
  ),
  encode(
    extensions.digest(
      (select created->>'qr_payload' from qr_room_state),
      'sha256'
    ),
    'hex'
  ),
  'the room stores the SHA-256 digest of the generated QR capability'
);
select is(
  (
    select count(*)
    from public.chat_rooms room
    where room.qr_payload_hash = (select created->>'qr_payload' from qr_room_state)
  ),
  0::bigint,
  'the raw QR capability is never persisted as the room identity'
);

create temporary table physical_table_room_state as
select public.join_chat_room_by_qr(
  '70000000-0000-4000-8000-000000000001',
  'pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
) as joined;

select is(
  ((select joined from physical_table_room_state)->>'room_id')::uuid is not null,
  true,
  'the first scan of a physical table creates a room'
);
select is(
  ((select joined from physical_table_room_state)->>'is_new_member')::boolean,
  true,
  'the first physical table scan adds the scanner as a member'
);
select is(
  (public.join_chat_room_by_qr(
    '70000000-0000-4000-8000-000000000001',
    'pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  )->>'is_new_member')::boolean,
  false,
  'repeated scans of a physical table are idempotent'
);
select is(
  public.join_chat_room_by_qr(
    '70000000-0000-4000-8000-000000000002',
    'pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  )->>'room_id',
  (select joined->>'room_id' from physical_table_room_state),
  'every scanner resolves the same physical table room'
);
select is(
  (
    select room.qr_payload_hash
    from public.chat_rooms room
    where room.id = ((select joined from physical_table_room_state)->>'room_id')::uuid
  ),
  encode(
    extensions.digest(
      'pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      'sha256'
    ),
    'hex'
  ),
  'physical table rooms store only the payload digest'
);
select is(
  (
    select count(*)
    from public.chat_rooms room
    where room.qr_payload_hash = 'pp-table-v1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
  ),
  0::bigint,
  'physical table room identities never store the raw table code'
);

select is(
  (
    public.send_room_message_transactional(
      ((select created from qr_room_state)->>'room_id')::uuid,
      '70000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000011',
      'first message'
    )->'message'->>'sequence'
  )::bigint,
  1::bigint,
  'the first room message receives sequence one'
);
select is(
  (
    public.send_room_message_transactional(
      ((select created from qr_room_state)->>'room_id')::uuid,
      '70000000-0000-4000-8000-000000000002',
      '70000000-0000-4000-8000-000000000012',
      'second message',
      p_reply_to_id := (
        select message.id
        from public.chat_room_messages message
        where message.client_id = '70000000-0000-4000-8000-000000000011'
      )
    )->'message'->>'sequence'
  )::bigint,
  2::bigint,
  'the second room message receives sequence two'
);
update public.chat_room_messages
set is_deleted = true
where client_id = '70000000-0000-4000-8000-000000000011';
select is(
  (
    public.send_room_message_transactional(
      p_room_id := ((select created from qr_room_state)->>'room_id')::uuid,
      p_sender_id := '70000000-0000-4000-8000-000000000002',
      p_client_id := '70000000-0000-4000-8000-000000000012',
      p_content := 'second message',
      p_reply_to_id := (
        select message.id
        from public.chat_room_messages message
        where message.client_id = '70000000-0000-4000-8000-000000000011'
      )
    )->'message'->>'sequence'
  )::bigint,
  2::bigint,
  'retries return the committed message before validating reply targets'
);
select is(
  public.send_room_message_transactional(
    ((select created from qr_room_state)->>'room_id')::uuid,
    '70000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000012',
    'different message',
    p_reply_to_id := (
      select message.id
      from public.chat_room_messages message
      where message.client_id = '70000000-0000-4000-8000-000000000011'
    )
  )->>'error',
  'IDEMPOTENCY_KEY_REUSED',
  'reusing a client key for different request data is rejected'
);
select is(
  (
    public.mark_chat_room_read(
      ((select created from qr_room_state)->>'room_id')::uuid,
      '70000000-0000-4000-8000-000000000001',
      1
    )->>'last_read_sequence'
  )::bigint,
  1::bigint,
  'read state is bounded to the sequence included in the response'
);
select is(
  (
    public.mark_chat_room_read(
      ((select created from qr_room_state)->>'room_id')::uuid,
      '70000000-0000-4000-8000-000000000001',
      1
    )->>'advanced'
  ),
  'true',
  'read response identifies an advancing transition'
);
select is(
  (
    public.mark_chat_room_read(
      ((select created from qr_room_state)->>'room_id')::uuid,
      '70000000-0000-4000-8000-000000000001',
      1
    )->>'advanced'
  ),
  'false',
  'read response suppresses duplicate transitions'
);
select is(
  (
    select member.last_read_sequence
    from public.chat_room_members member
    where member.room_id = ((select created from qr_room_state)->>'room_id')::uuid
      and member.user_id = '70000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'bounded read state does not advance to a newer unseen message'
);

select * from finish();
rollback;
