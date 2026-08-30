begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

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

select * from finish();
rollback;
