-- Shared QR groups
--
-- A QR group is keyed by the SHA-256 hex digest of the exact decoded QR text's
-- UTF-8 bytes. The raw text is never persisted, logged, or returned. No trim,
-- Unicode normalization, case folding, URL parsing, fetching, or navigation is
-- part of identity semantics. The API bounds decoded text at 4,096 characters.
-- This migration is additive and keeps existing DM tables and RPCs unchanged.

create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  qr_content_hash text not null unique
    check (qr_content_hash similar to '[0-9a-f]{64}'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  next_message_sequence bigint not null default 0
    check (next_message_sequence >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_group_members (
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_sequence bigint not null default 0
    check (last_read_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.shared_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  sequence bigint not null check (sequence > 0),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  message_type text not null default 'text' check (message_type = 'text'),
  is_read boolean not null default false,
  is_edited boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, sequence),
  unique (group_id, client_id)
);

create index if not exists shared_group_members_user_group_idx
  on public.shared_group_members (user_id, group_id);
create index if not exists shared_group_messages_group_created_idx
  on public.shared_group_messages (group_id, created_at desc, id desc);

alter table public.shared_groups enable row level security;
alter table public.shared_group_members enable row level security;
alter table public.shared_group_messages enable row level security;

drop policy if exists "shared groups are server only" on public.shared_groups;
create policy "shared groups are server only"
  on public.shared_groups for all to authenticated
  using (false) with check (false);
drop policy if exists "shared group members are server only" on public.shared_group_members;
create policy "shared group members are server only"
  on public.shared_group_members for all to authenticated
  using (false) with check (false);
drop policy if exists "shared group messages are server only" on public.shared_group_messages;
create policy "shared group messages are server only"
  on public.shared_group_messages for all to authenticated
  using (false) with check (false);

revoke all on public.shared_groups from anon, authenticated;
revoke all on public.shared_group_members from anon, authenticated;
revoke all on public.shared_group_messages from anon, authenticated;
grant all on public.shared_groups, public.shared_group_members, public.shared_group_messages to service_role;

create or replace function public.create_or_join_shared_group(
  p_user_id uuid,
  p_qr_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.shared_groups%rowtype;
  v_hash text;
  v_new_group boolean := false;
  v_new_member boolean := false;
begin
  if p_qr_content is null or pg_catalog.char_length(p_qr_content) < 1
     or pg_catalog.char_length(p_qr_content) > 4096 then
    return pg_catalog.jsonb_build_object('error', 'INVALID_QR_CONTENT');
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id and profile.deleted_at is null
  ) then
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_NOT_ACTIVE');
  end if;

  -- Keep the exact decoded text opaque. convert_to is deterministic for the
  -- resulting text and does not treat QR payloads as URLs or executable input.
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_qr_content, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.shared_groups (qr_content_hash, created_by)
  values (v_hash, p_user_id)
  on conflict (qr_content_hash) do nothing
  returning * into v_group;

  if not found then
    select * into v_group
    from public.shared_groups group_row
    where group_row.qr_content_hash = v_hash
    for update;
  else
    v_new_group := true;
  end if;

  insert into public.shared_group_members (group_id, user_id)
  values (v_group.id, p_user_id)
  on conflict (group_id, user_id) do nothing;
  v_new_member := found;

  return pg_catalog.jsonb_build_object(
    'group', pg_catalog.jsonb_build_object(
      'id', v_group.id,
      'name', 'Shared group',
      'member_count', (
        select count(*)::integer
        from public.shared_group_members member
        where member.group_id = v_group.id
      ),
      'last_message_at', v_group.last_message_at,
      'last_message_preview', v_group.last_message_preview,
      'created_at', v_group.created_at,
      'unread_count', (
        select count(*)::integer
        from public.shared_group_messages unread_message
        join public.shared_group_members unread_member
          on unread_member.group_id = unread_message.group_id
         and unread_member.user_id = p_user_id
        where unread_message.group_id = v_group.id
          and unread_message.sequence > unread_member.last_read_sequence
      )
    ),
    'is_new_group', v_new_group,
    'is_new_member', v_new_member
  );
end;
$$;

create or replace function public.get_shared_groups(
  p_user_id uuid,
  p_before_sort_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(item.payload order by item.sort_at desc, item.id desc),
    '[]'::jsonb
  )
  from (
    select
      group_row.id,
      coalesce(group_row.last_message_at, group_row.created_at) as sort_at,
      pg_catalog.jsonb_build_object(
        'id', group_row.id,
        'name', 'Shared group',
        'member_count', (
          select count(*)::integer
          from public.shared_group_members count_member
          where count_member.group_id = group_row.id
        ),
        'last_message_at', group_row.last_message_at,
        'last_message_preview', group_row.last_message_preview,
        'created_at', group_row.created_at,
        'unread_count', (
          select count(*)::integer
          from public.shared_group_messages unread_message
          where unread_message.group_id = group_row.id
            and unread_message.sequence > member.last_read_sequence
        )
      ) as payload
    from public.shared_group_members member
    join public.shared_groups group_row on group_row.id = member.group_id
    join public.profiles profile on profile.id = member.user_id
    where member.user_id = p_user_id
      and profile.deleted_at is null
      and (
        p_before_sort_at is null
        or coalesce(group_row.last_message_at, group_row.created_at) < p_before_sort_at
        or (
          coalesce(group_row.last_message_at, group_row.created_at) = p_before_sort_at
          and group_row.id < p_before_id
        )
      )
    order by coalesce(group_row.last_message_at, group_row.created_at) desc, group_row.id desc
    limit pg_catalog.least(pg_catalog.greatest(p_limit, 1), 100) + 1
  ) item;
$$;

create or replace function public.get_shared_groups(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_shared_groups(p_user_id, null::timestamptz, null::uuid, 100);
$$;

create or replace function public.send_shared_group_message_transactional(
  p_group_id uuid,
  p_sender_id uuid,
  p_client_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.shared_groups%rowtype;
  v_existing public.shared_group_messages%rowtype;
  v_message public.shared_group_messages%rowtype;
  v_sequence bigint;
  v_message_json jsonb;
begin
  if p_content is null
     or p_content is distinct from pg_catalog.btrim(p_content)
     or pg_catalog.char_length(p_content) not between 1 and 4000 then
    return pg_catalog.jsonb_build_object('error', 'INVALID_MESSAGE');
  end if;

  select * into v_group
  from public.shared_groups group_row
  where group_row.id = p_group_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  if not exists (
    select 1 from public.shared_group_members member
    where member.group_id = p_group_id and member.user_id = p_sender_id
  ) then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_sender_id and profile.deleted_at is null
  ) then
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_NOT_ACTIVE');
  end if;

  select * into v_existing
  from public.shared_group_messages message
  where message.group_id = p_group_id and message.client_id = p_client_id;
  if found then
    if v_existing.sender_id is distinct from p_sender_id
       or v_existing.content is distinct from p_content then
      return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
    end if;
    v_message := v_existing;
  else
    update public.shared_groups group_row
    set next_message_sequence = group_row.next_message_sequence + 1,
        last_message_at = pg_catalog.clock_timestamp(),
        last_message_preview = left(p_content, 140)
    where group_row.id = p_group_id
    returning next_message_sequence into v_sequence;

    insert into public.shared_group_messages (
      group_id, sender_id, client_id, sequence, content, is_read
    )
    values (p_group_id, p_sender_id, p_client_id, v_sequence, p_content, true)
    returning * into v_message;

    update public.shared_group_members member
    set last_read_sequence = greatest(member.last_read_sequence, v_sequence),
        updated_at = pg_catalog.clock_timestamp()
    where member.group_id = p_group_id and member.user_id = p_sender_id;

    insert into public.outbox_events (
      event_type, aggregate_type, aggregate_id, payload
    )
    values (
      'shared_group.message.changed',
      'shared_group',
      p_group_id::text,
      pg_catalog.jsonb_build_object(
        'group_id', p_group_id,
        'message_id', v_message.id,
        'sender_id', p_sender_id,
        'recipient_ids', (
          select pg_catalog.coalesce(
            pg_catalog.jsonb_agg(member.user_id order by member.user_id),
            '[]'::jsonb
          )
          from public.shared_group_members member
          where member.group_id = p_group_id
        ),
        'sequence', v_sequence,
        'action', 'sent'
      )
    );
  end if;

  select (pg_catalog.to_jsonb(message.*) - 'group_id') || pg_catalog.jsonb_build_object(
    'thread_id', message.group_id,
    'sender', pg_catalog.to_jsonb(sender.*),
    'reply_to', null
  )
  into v_message_json
  from public.shared_group_messages message
  join public.profiles sender on sender.id = message.sender_id
  where message.id = v_message.id;

  return pg_catalog.jsonb_build_object(
    'message', v_message_json,
    'deduplicated', v_existing.id is not null
  );
end;
$$;

create or replace function public.mark_shared_group_read(
  p_group_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_last_read_sequence bigint;
begin
  select group_row.next_message_sequence, member.last_read_sequence
  into v_sequence, v_last_read_sequence
  from public.shared_groups group_row
  join public.shared_group_members member
    on member.group_id = group_row.id and member.user_id = p_user_id
  where group_row.id = p_group_id
  for update of member;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  if v_sequence > v_last_read_sequence then
    update public.shared_group_members member
    set last_read_sequence = v_sequence,
        updated_at = pg_catalog.clock_timestamp()
    where member.group_id = p_group_id and member.user_id = p_user_id;

  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'last_read_sequence', greatest(v_sequence, v_last_read_sequence)
  );
end;
$$;

revoke all on function public.create_or_join_shared_group(uuid, text) from public, anon, authenticated;
revoke all on function public.get_shared_groups(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.get_shared_groups(uuid) from public, anon, authenticated;
revoke all on function public.send_shared_group_message_transactional(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_shared_group_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_or_join_shared_group(uuid, text) to service_role;
grant execute on function public.get_shared_groups(uuid, timestamptz, uuid, integer) to service_role;
grant execute on function public.get_shared_groups(uuid) to service_role;
grant execute on function public.send_shared_group_message_transactional(uuid, uuid, uuid, text) to service_role;
grant execute on function public.mark_shared_group_read(uuid, uuid) to service_role;

create or replace function public.erase_shared_group_account_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_ids uuid[];
begin
  select pg_catalog.array_agg(distinct message.group_id)
  into v_group_ids
  from public.shared_group_messages message
  where message.sender_id = new.id;

  delete from public.outbox_events outbox_event
  where outbox_event.event_type = 'shared_group.message.changed'
    and outbox_event.payload ->> 'message_id' in (
      select message.id::text
      from public.shared_group_messages message
      where message.sender_id = new.id
    );

  update public.outbox_events outbox_event
  set payload = pg_catalog.jsonb_set(
    outbox_event.payload,
    '{recipient_ids}',
    (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(recipient.value order by recipient.ordinality),
        '[]'::jsonb
      )
      from pg_catalog.jsonb_array_elements_text(outbox_event.payload -> 'recipient_ids')
        with ordinality as recipient(value, ordinality)
      where recipient.value <> new.id::text
    ),
    true
  )
  where outbox_event.event_type = 'shared_group.message.changed'
    and outbox_event.payload -> 'recipient_ids' ? new.id::text;

  delete from public.shared_group_messages message
  where message.sender_id = new.id;
  delete from public.shared_group_members member
  where member.user_id = new.id;

  if v_group_ids is not null then
    update public.shared_groups group_row
    set last_message_at = (
          select message.created_at
          from public.shared_group_messages message
          where message.group_id = group_row.id
          order by message.sequence desc
          limit 1
        ),
        last_message_preview = (
          select pg_catalog.left(message.content, 140)
          from public.shared_group_messages message
          where message.group_id = group_row.id
          order by message.sequence desc
          limit 1
        )
    where group_row.id = any(v_group_ids);
  end if;

  return new;
end;
$$;

revoke all on function public.erase_shared_group_account_data() from public, anon, authenticated, service_role;

drop trigger if exists erase_shared_group_account_data_on_profile on public.profiles;
create trigger erase_shared_group_account_data_on_profile
after update of deleted_at on public.profiles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.erase_shared_group_account_data();
