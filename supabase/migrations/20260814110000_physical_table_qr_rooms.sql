-- Physical table QR codes are stable opaque identifiers.
-- This additive migration preserves the older generated room-share payloads
-- while making table payloads idempotently create their room on first use.
-- Do not execute this file against production without the normal migration
-- promotion and verification process.

create or replace function public.join_chat_room_by_qr(
  p_user_id uuid,
  p_qr_payload text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_deleted_at timestamptz;
  v_room public.chat_rooms%rowtype;
  v_hash text;
  v_inserted integer;
  v_is_table_code boolean;
begin
  -- Table codes are printed on real tables and must be accepted without a
  -- prior app-side room creation. The legacy room-share shape remains valid as
  -- a secondary invitation capability.
  if p_qr_payload is null
     or p_qr_payload !~ '^pp-(?:table|room)-v1\.[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error', 'INVALID_QR_PAYLOAD');
  end if;

  v_is_table_code := p_qr_payload like 'pp-table-v1.%';

  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;
  if not found or v_profile_deleted_at is not null then
    return jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  v_hash := encode(extensions.digest(p_qr_payload, 'sha256'), 'hex');
  select room.*
  into v_room
  from public.chat_rooms room
  where room.qr_payload_hash = v_hash
  for update;

  if not found and v_is_table_code then
    -- The unique digest constraint serializes two simultaneous first scans of
    -- the same physical code. A losing transaction re-reads the winner below.
    begin
      insert into public.chat_rooms (qr_payload_hash, name, created_by)
      values (v_hash, 'Table room', p_user_id)
      returning * into v_room;
    exception when unique_violation then
      select room.*
      into v_room
      from public.chat_rooms room
      where room.qr_payload_hash = v_hash
      for update;
    end;
  end if;

  if not found and v_room.id is null then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;

  insert into public.chat_room_members (room_id, user_id)
  values (v_room.id, p_user_id)
  on conflict (room_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'room_id', v_room.id,
    'is_new_member', v_inserted = 1
  );
end;
$$;

revoke all on function public.join_chat_room_by_qr(uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_chat_room_by_qr(uuid, text)
  to service_role;
