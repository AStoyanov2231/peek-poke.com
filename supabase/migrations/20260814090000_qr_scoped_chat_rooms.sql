-- QR-scoped group rooms. This migration is additive: legacy direct-message and
-- location tables/RPCs remain available to already-deployed clients, but the
-- new application flow never reads or writes them.

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  -- Store only a one-way digest. The capability itself is returned once to the
  -- creator and is never part of a URL, room name, or durable client state.
  qr_payload_hash text not null unique check (qr_payload_hash ~ '^[0-9a-f]{64}$'),
  name text not null default 'Group room' check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_message_at timestamptz,
  last_message_preview text,
  next_message_sequence bigint not null default 0 check (next_message_sequence >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.chat_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  client_id uuid,
  sequence bigint not null check (sequence > 0),
  content text,
  message_type public.message_type not null default 'text',
  media_url text,
  media_thumbnail_url text,
  is_read boolean not null default false,
  is_edited boolean not null default false,
  is_deleted boolean not null default false,
  reply_to_id uuid references public.chat_room_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (room_id, sequence),
  unique (room_id, client_id)
);

create index if not exists chat_room_members_user_idx
  on public.chat_room_members (user_id, updated_at desc, room_id);
create index if not exists chat_room_messages_room_created_idx
  on public.chat_room_messages (room_id, created_at desc, id desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_messages enable row level security;

-- Direct table access is intentionally read-only for members. Mutations go
-- through security-definer RPCs and the authenticated API route checks.
drop policy if exists "room members can read rooms" on public.chat_rooms;
create policy "room members can read rooms"
  on public.chat_rooms for select to authenticated
  using (exists (
    select 1 from public.chat_room_members member
    where member.room_id = chat_rooms.id
      and member.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.deleted_at is null
  ));

drop policy if exists "members can read their room membership" on public.chat_room_members;
create policy "members can read their room membership"
  on public.chat_room_members for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
    )
  );

drop policy if exists "room members can read messages" on public.chat_room_messages;
create policy "room members can read messages"
  on public.chat_room_messages for select to authenticated
  using (exists (
    select 1 from public.chat_room_members member
    where member.room_id = chat_room_messages.room_id
      and member.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.deleted_at is null
  ));

drop policy if exists "room members can insert their messages" on public.chat_room_messages;
create policy "room members can insert their messages"
  on public.chat_room_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.chat_room_members member
      where member.room_id = chat_room_messages.room_id
        and member.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
    )
  );

drop policy if exists "authors can update room messages" on public.chat_room_messages;
create policy "authors can update room messages"
  on public.chat_room_messages for update to authenticated
  using (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
    )
  )
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
    )
  );

drop policy if exists "authors can delete room messages" on public.chat_room_messages;
create policy "authors can delete room messages"
  on public.chat_room_messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.deleted_at is null
    )
  );

grant select on public.chat_rooms, public.chat_room_members, public.chat_room_messages to authenticated;
-- All room writes go through the transactional security-definer RPCs below.
revoke insert, update, delete on public.chat_room_messages from authenticated;
revoke all on public.chat_rooms, public.chat_room_members, public.chat_room_messages from anon;
grant all on public.chat_rooms, public.chat_room_members, public.chat_room_messages to service_role;

-- Postgres Changes is used for message delivery; keep the table in the
-- existing realtime publication without failing if it was preconfigured.
do $$
begin
  alter publication supabase_realtime add table public.chat_room_messages;
exception when duplicate_object then
  null;
end;
$$;

create or replace function public.create_chat_room(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_deleted_at timestamptz;
  v_room public.chat_rooms%rowtype;
  v_payload text;
  v_hash text;
begin
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;
  if not found or v_profile_deleted_at is not null then
    return jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  loop
    v_payload := 'pp-room-v1.' || pg_catalog.rtrim(
      pg_catalog.translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
      '='
    );
    v_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    begin
      insert into public.chat_rooms (qr_payload_hash, created_by)
      values (v_hash, p_user_id)
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- A random collision is harmless; generate a fresh capability.
      null;
    end;
  end loop;

  insert into public.chat_room_members (room_id, user_id)
  values (v_room.id, p_user_id);

  return jsonb_build_object(
    'room_id', v_room.id,
    'qr_payload', v_payload
  );
end;
$$;

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
begin
  -- Validate both shape and entropy at the database boundary. No raw payload
  -- is written to a table, emitted in an error, or included in the result.
  if p_qr_payload is null
     or p_qr_payload !~ '^pp-room-v1\.[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error', 'INVALID_QR_PAYLOAD');
  end if;
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;
  if not found or v_profile_deleted_at is not null then
    return jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  v_hash := encode(extensions.digest(p_qr_payload, 'sha256'), 'hex');
  select * into v_room
  from public.chat_rooms room
  where room.qr_payload_hash = v_hash
  for update;
  if not found then
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

create or replace function public.send_room_message_transactional(
  p_room_id uuid,
  p_sender_id uuid,
  p_client_id uuid,
  p_content text,
  p_message_type text default 'text',
  p_media_url text default null,
  p_media_thumbnail_url text default null,
  p_reply_to_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_deleted_at timestamptz;
  v_room public.chat_rooms%rowtype;
  v_sequence bigint;
  v_created_at timestamptz;
  v_message_id uuid;
  v_message jsonb;
  v_deduplicated boolean := false;
begin
  select profile.deleted_at
  into v_sender_deleted_at
  from public.profiles profile
  where profile.id = p_sender_id
  for update;
  if not found or v_sender_deleted_at is not null then
    return jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  select room.* into v_room
  from public.chat_rooms room
  join public.chat_room_members member on member.room_id = room.id
  where room.id = p_room_id
    and member.user_id = p_sender_id
  for update;
  if not found then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;

  select message.id into v_message_id
  from public.chat_room_messages message
  where message.room_id = p_room_id
    and message.client_id = p_client_id;

  if v_message_id is null then
    if p_reply_to_id is not null and not exists (
      select 1 from public.chat_room_messages reply
      where reply.id = p_reply_to_id
        and reply.room_id = p_room_id
        and reply.is_deleted = false
    ) then
      return jsonb_build_object('error', 'REPLY_TARGET_NOT_FOUND');
    end if;

    v_created_at := clock_timestamp();
    update public.chat_rooms
    set next_message_sequence = next_message_sequence + 1,
        last_message_at = v_created_at,
        last_message_preview = case when p_message_type = 'image' then 'Photo' else left(p_content, 240) end
    where id = p_room_id
    returning next_message_sequence into v_sequence;

    insert into public.chat_room_messages (
      room_id, sender_id, client_id, sequence, content, message_type,
      media_url, media_thumbnail_url, reply_to_id, created_at
    ) values (
      p_room_id, p_sender_id, p_client_id, v_sequence, p_content,
      p_message_type::public.message_type, p_media_url,
      p_media_thumbnail_url, p_reply_to_id, v_created_at
    ) returning id into v_message_id;

    update public.chat_room_members
    set last_read_sequence = greatest(last_read_sequence, v_sequence), updated_at = now()
    where room_id = p_room_id and user_id = p_sender_id;
  else
    v_deduplicated := true;
  end if;

  select to_jsonb(message.*) || jsonb_build_object(
    'sender', to_jsonb(sender.*),
    'reply_to', case when message.reply_to_id is not null then (
      select jsonb_build_object('id', reply.id, 'sender_id', reply.sender_id, 'content', reply.content)
      from public.chat_room_messages reply where reply.id = message.reply_to_id
    ) else null end
  ) into v_message
  from public.chat_room_messages message
  join public.profiles sender on sender.id = message.sender_id
  where message.id = v_message_id;

  return jsonb_build_object(
    'message', v_message,
    'deduplicated', v_deduplicated
  );
end;
$$;

create or replace function public.get_chat_room_summary(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_deleted_at timestamptz;
  v_summary jsonb;
begin
  if v_user_id is null then
    return null;
  end if;
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = v_user_id
  for share;
  if not found or v_profile_deleted_at is not null then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', room.id,
    'name', room.name,
    'created_at', room.created_at,
    'last_message_at', room.last_message_at,
    'last_message_preview', room.last_message_preview,
    'member_count', (
      select pg_catalog.count(*)::integer
      from public.chat_room_members member_count
      where member_count.room_id = room.id
    ),
    'unread_count', (
      select pg_catalog.count(*)::integer
      from public.chat_room_messages unread
      where unread.room_id = room.id
        and unread.is_deleted = false
        and unread.sequence > member.last_read_sequence
    )
  )
  into v_summary
  from public.chat_rooms room
  join public.chat_room_members member
    on member.room_id = room.id
   and member.user_id = v_user_id
  where room.id = p_room_id;
  return v_summary;
end;
$$;

create or replace function public.list_chat_room_summaries(
  p_limit integer default 101,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  member_count integer,
  unread_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_deleted_at timestamptz;
begin
  if v_user_id is null then
    return;
  end if;
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = v_user_id
  for share;
  if not found or v_profile_deleted_at is not null then
    raise exception 'ACCOUNT_DELETED';
  end if;

  return query
  select
    room.id,
    room.name,
    room.created_at,
    room.last_message_at,
    room.last_message_preview,
    pg_catalog.count(distinct all_member.user_id)::integer,
    pg_catalog.count(distinct unread.id)::integer
  from public.chat_rooms room
  join public.chat_room_members member
    on member.room_id = room.id
   and member.user_id = v_user_id
  left join public.chat_room_members all_member
    on all_member.room_id = room.id
  left join public.chat_room_messages unread
    on unread.room_id = room.id
   and unread.is_deleted = false
   and unread.sequence > member.last_read_sequence
  where p_cursor_at is null
     or pg_catalog.coalesce(room.last_message_at, room.created_at) > p_cursor_at
     or (
       pg_catalog.coalesce(room.last_message_at, room.created_at) = p_cursor_at
       and room.id > p_cursor_id
     )
  group by room.id, room.name, room.created_at, room.last_message_at,
    room.last_message_preview, member.last_read_sequence
  order by pg_catalog.coalesce(room.last_message_at, room.created_at), room.id
  limit pg_catalog.least(pg_catalog.greatest(pg_catalog.coalesce(p_limit, 101), 1), 101);
end;
$$;

create or replace function public.get_chat_room_unread_count()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_deleted_at timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    return null;
  end if;
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = v_user_id
  for share;
  if not found or v_profile_deleted_at is not null then
    raise exception 'ACCOUNT_DELETED';
  end if;
  select pg_catalog.count(*)::integer
  into v_count
  from public.chat_room_members member
  where member.user_id = v_user_id
    and exists (
      select 1
      from public.chat_room_messages unread
      where unread.room_id = member.room_id
        and unread.is_deleted = false
        and unread.sequence > member.last_read_sequence
    );
  return v_count;
end;
$$;

drop function if exists public.mark_chat_room_read(uuid, uuid);

create or replace function public.mark_chat_room_read(
  p_room_id uuid,
  p_user_id uuid,
  p_max_sequence bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_deleted_at timestamptz;
  v_sequence bigint;
  v_last_read_sequence bigint;
  v_count integer;
begin
  select profile.deleted_at
  into v_profile_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;
  if not found or v_profile_deleted_at is not null then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;

  select room.next_message_sequence into v_sequence
  from public.chat_rooms room
  join public.chat_room_members member on member.room_id = room.id
  where room.id = p_room_id and member.user_id = p_user_id
    and exists (
      select 1 from public.profiles profile
      where profile.id = p_user_id and profile.deleted_at is null
    )
  for update;
  if not found then return jsonb_build_object('error', 'ROOM_NOT_FOUND'); end if;

  v_sequence := pg_catalog.greatest(
    0::bigint,
    pg_catalog.least(
      pg_catalog.coalesce(p_max_sequence, v_sequence),
      v_sequence
    )
  );
  update public.chat_room_members
  set last_read_sequence = greatest(last_read_sequence, coalesce(v_sequence, 0)), updated_at = now()
  where room_id = p_room_id and user_id = p_user_id
  returning last_read_sequence into v_last_read_sequence;
  get diagnostics v_count = row_count;
  return jsonb_build_object('success', v_count = 1, 'last_read_sequence', coalesce(v_last_read_sequence, 0));
end;
$$;

revoke all on function public.create_chat_room(uuid) from public, anon, authenticated;
revoke all on function public.join_chat_room_by_qr(uuid, text) from public, anon, authenticated;
revoke all on function public.send_room_message_transactional(uuid, uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_chat_room_summary(uuid) from public, anon, service_role;
revoke all on function public.list_chat_room_summaries(integer, timestamptz, uuid) from public, anon, service_role;
revoke all on function public.get_chat_room_unread_count() from public, anon, service_role;
revoke all on function public.mark_chat_room_read(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_chat_room(uuid) to service_role;
grant execute on function public.join_chat_room_by_qr(uuid, text) to service_role;
grant execute on function public.send_room_message_transactional(uuid, uuid, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.get_chat_room_summary(uuid) to authenticated;
grant execute on function public.list_chat_room_summaries(integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_chat_room_unread_count() to authenticated;
grant execute on function public.mark_chat_room_read(uuid, uuid, bigint) to service_role;

-- Private Realtime topic authorization. Existing DM/call topic rules remain
-- unchanged; room topics are readable only by current room members.
drop policy if exists "authenticated scoped realtime read" on realtime.messages;
create policy "authenticated scoped realtime read"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'sync:user:' || (select auth.uid())::text
    or (select realtime.topic()) = 'calls:user:' || (select auth.uid())::text
    or (
      (
        (select realtime.topic()) like 'call:%'
        or (select realtime.topic()) like 'thread:%'
      )
      and app_private.can_access_dm_thread(
        split_part((select realtime.topic()), ':', 2)
      )
    )
    or (
      (select realtime.topic()) like 'room:%'
      and exists (
        select 1 from public.chat_room_members member
        where member.room_id = case
          when split_part((select realtime.topic()), ':', 2)
            ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then split_part((select realtime.topic()), ':', 2)::uuid
          else null::uuid
        end
          and member.user_id = (select auth.uid())
      )
      and exists (
        select 1 from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.deleted_at is null
      )
    )
  );
