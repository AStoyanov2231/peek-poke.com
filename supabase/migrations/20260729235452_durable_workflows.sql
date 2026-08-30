-- Additive messaging, device, idempotency, and durable-workflow foundation.
-- Existing columns and RPCs remain during the compatibility window.

alter table public.dm_threads
  add column if not exists next_message_sequence bigint not null default 0;

alter table public.dm_messages
  add column if not exists sequence bigint,
  add column if not exists client_id uuid;

with ranked as (
  select
    id,
    row_number() over (
      partition by thread_id
      order by created_at asc, id asc
    )::bigint as sequence
  from public.dm_messages
  where sequence is null
)
update public.dm_messages message
set sequence = ranked.sequence
from ranked
where message.id = ranked.id;

update public.dm_threads thread
set next_message_sequence = coalesce((
  select max(message.sequence)
  from public.dm_messages message
  where message.thread_id = thread.id
), 0);

alter table public.dm_messages
  alter column sequence set not null;

create unique index if not exists dm_messages_thread_sequence_uidx
  on public.dm_messages (thread_id, sequence);

create unique index if not exists dm_messages_thread_client_uidx
  on public.dm_messages (thread_id, client_id)
  where client_id is not null;

create table if not exists public.dm_thread_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

insert into public.dm_thread_members (thread_id, user_id)
select id, participant_1_id from public.dm_threads
on conflict (thread_id, user_id) do nothing;

insert into public.dm_thread_members (thread_id, user_id)
select id, participant_2_id from public.dm_threads
on conflict (thread_id, user_id) do nothing;

update public.dm_thread_members member
set last_read_sequence = greatest(
  member.last_read_sequence,
  coalesce((
    select min(message.sequence) - 1
    from public.dm_messages message
    where message.thread_id = member.thread_id
      and message.sender_id <> member.user_id
      and message.is_read = false
  ), (
    select thread.next_message_sequence
    from public.dm_threads thread
    where thread.id = member.thread_id
  ), 0)
);

create index if not exists dm_thread_members_user_thread_idx
  on public.dm_thread_members (user_id, thread_id);

alter table public.dm_thread_members enable row level security;
drop policy if exists "dm thread members are server only" on public.dm_thread_members;
create policy "dm thread members are server only"
  on public.dm_thread_members
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_thread_members from anon, authenticated;
grant all on public.dm_thread_members to service_role;

create or replace function public.add_dm_thread_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dm_thread_members (thread_id, user_id)
  values
    (new.id, new.participant_1_id),
    (new.id, new.participant_2_id)
  on conflict (thread_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists add_dm_thread_members_after_insert on public.dm_threads;
create trigger add_dm_thread_members_after_insert
after insert on public.dm_threads
for each row execute function public.add_dm_thread_members();

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  provider text not null default 'expo' check (provider in ('expo', 'apns', 'fcm')),
  revoked_at timestamptz,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (token)
);

create index if not exists push_devices_active_user_idx
  on public.push_devices (user_id, last_registered_at desc)
  where revoked_at is null;

insert into public.push_devices (user_id, token, platform, provider)
select
  profile.id,
  entry ->> 'token',
  case when entry ->> 'platform' = 'android' then 'android' else 'ios' end,
  case
    when entry ->> 'provider' in ('expo', 'apns', 'fcm') then entry ->> 'provider'
    else 'expo'
  end
from public.profiles profile
cross join lateral jsonb_array_elements(coalesce(profile.push_tokens, '[]'::jsonb)) entry
where nullif(entry ->> 'token', '') is not null
on conflict (token) do update
set
  user_id = excluded.user_id,
  platform = excluded.platform,
  provider = excluded.provider,
  revoked_at = null,
  last_registered_at = now();

alter table public.push_devices enable row level security;
drop policy if exists "push devices are server only" on public.push_devices;
create policy "push devices are server only"
  on public.push_devices
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;

create or replace function public.upsert_push_device(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_platform not in ('ios', 'android')
     or p_provider not in ('expo', 'apns', 'fcm')
     or nullif(p_token, '') is null then
    raise exception 'Invalid push device';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_token, 0)
  );

  insert into public.push_devices (
    user_id,
    token,
    platform,
    provider,
    revoked_at,
    last_registered_at
  )
  values (
    p_user_id,
    p_token,
    p_platform,
    p_provider,
    null,
    now()
  )
  on conflict (token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    provider = excluded.provider,
    revoked_at = null,
    last_registered_at = now();
end;
$$;

create or replace function public.revoke_push_device(
  p_user_id uuid,
  p_token text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_devices
  set revoked_at = now()
  where user_id = p_user_id
    and token = p_token
    and revoked_at is null;
$$;

revoke all on function public.upsert_push_device(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_push_device(uuid, text) from public, anon, authenticated;
grant execute on function public.upsert_push_device(uuid, text, text, text) to service_role;
grant execute on function public.revoke_push_device(uuid, text) to service_role;

create table if not exists public.idempotency_records (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (actor_id, operation, key)
);

create index if not exists idempotency_records_expiry_idx
  on public.idempotency_records (expires_at);

alter table public.idempotency_records enable row level security;
drop policy if exists "idempotency records are server only" on public.idempotency_records;
create policy "idempotency records are server only"
  on public.idempotency_records
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.idempotency_records from anon, authenticated;
grant all on public.idempotency_records to service_role;

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outbox_events_claim_idx
  on public.outbox_events (status, available_at, created_at)
  where status in ('pending', 'processing');

create index if not exists outbox_events_aggregate_idx
  on public.outbox_events (aggregate_type, aggregate_id, created_at desc);

create unique index if not exists outbox_events_call_invite_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'call.invite';

alter table public.outbox_events enable row level security;
drop policy if exists "outbox events are server only" on public.outbox_events;
create policy "outbox events are server only"
  on public.outbox_events
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.outbox_events from anon, authenticated;
grant all on public.outbox_events to service_role;

-- The existing billing receipt RPC updates this projection in the same
-- transaction. A row trigger therefore makes the durable handoff atomic
-- without changing the externally called RPC signature.
create or replace function public.enqueue_billing_entitlement_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'billing.applied',
    'billing_entitlement',
    new.user_id::text,
    jsonb_build_object(
      'user_id', new.user_id,
      'provider', new.provider,
      'event_id', new.event_id,
      'active', new.active,
      'expires_at', new.expires_at,
      'product_id', new.product_id
    )
  );
  return new;
end;
$$;

drop trigger if exists enqueue_billing_entitlement_after_change
  on public.billing_entitlement_state;
create trigger enqueue_billing_entitlement_after_change
after insert or update of event_id, active, expires_at, product_id
on public.billing_entitlement_state
for each row execute function public.enqueue_billing_entitlement_event();

create or replace function public.claim_outbox_events(
  p_limit integer,
  p_worker_id text
)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 or nullif(p_worker_id, '') is null then
    raise exception 'Invalid outbox claim';
  end if;

  return query
  with claimable as (
    select event.id
    from public.outbox_events event
    where (
      event.status = 'pending'
      or (
        event.status = 'processing'
        and event.locked_at < now() - interval '5 minutes'
      )
    )
      and event.available_at <= now()
    order by event.available_at asc, event.created_at asc
    for update skip locked
    limit p_limit
  )
  update public.outbox_events event
  set
    status = 'processing',
    attempts = event.attempts + 1,
    locked_at = now(),
    locked_by = p_worker_id
  from claimable
  where event.id = claimable.id
  returning event.*;
end;
$$;

create or replace function public.complete_outbox_event(
  p_event_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.outbox_events
  set
    status = 'completed',
    completed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where id = p_event_id
    and status = 'processing'
    and locked_by = p_worker_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.retry_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_error text,
  p_available_at timestamptz,
  p_dead boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.outbox_events
  set
    status = case when p_dead then 'dead' else 'pending' end,
    available_at = p_available_at,
    locked_at = null,
    locked_by = null,
    last_error = left(coalesce(p_error, 'Unknown worker error'), 1000)
  where id = p_event_id
    and status = 'processing'
    and locked_by = p_worker_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.claim_outbox_events(integer, text) from public, anon, authenticated;
revoke all on function public.complete_outbox_event(uuid, text) from public, anon, authenticated;
revoke all on function public.retry_outbox_event(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer, text) to service_role;
grant execute on function public.complete_outbox_event(uuid, text) to service_role;
grant execute on function public.retry_outbox_event(uuid, text, text, timestamptz, boolean) to service_role;

create or replace function public.send_message_transactional(
  p_thread_id uuid,
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
  v_thread public.dm_threads%rowtype;
  v_peer_id uuid;
  v_sequence bigint;
  v_message_id uuid;
  v_message jsonb;
begin
  select *
  into v_thread
  from public.dm_threads
  where id = p_thread_id
    and (participant_1_id = p_sender_id or participant_2_id = p_sender_id)
  for update;

  if not found then
    return jsonb_build_object('error', 'THREAD_NOT_FOUND');
  end if;

  v_peer_id := case
    when v_thread.participant_1_id = p_sender_id then v_thread.participant_2_id
    else v_thread.participant_1_id
  end;

  if exists (
    select 1
    from public.user_blocks block
    where (block.blocker_id = p_sender_id and block.blocked_id = v_peer_id)
       or (block.blocker_id = v_peer_id and block.blocked_id = p_sender_id)
  ) then
    return jsonb_build_object('error', 'BLOCKED');
  end if;

  if exists (
    select 1 from public.profiles profile
    where profile.id in (p_sender_id, v_peer_id)
      and profile.deleted_at is not null
  ) then
    return jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  if p_reply_to_id is not null and not exists (
    select 1
    from public.dm_messages reply
    where reply.id = p_reply_to_id
      and reply.thread_id = p_thread_id
      and reply.is_deleted = false
  ) then
    return jsonb_build_object('error', 'REPLY_TARGET_NOT_FOUND');
  end if;

  select message.id
  into v_message_id
  from public.dm_messages message
  where message.thread_id = p_thread_id
    and message.client_id = p_client_id;

  if v_message_id is null then
    update public.dm_threads
    set next_message_sequence = next_message_sequence + 1
    where id = p_thread_id
    returning next_message_sequence into v_sequence;

    insert into public.dm_messages (
      thread_id,
      sender_id,
      client_id,
      sequence,
      content,
      message_type,
      media_url,
      media_thumbnail_url,
      reply_to_id
    )
    values (
      p_thread_id,
      p_sender_id,
      p_client_id,
      v_sequence,
      p_content,
      p_message_type::public.message_type,
      p_media_url,
      p_media_thumbnail_url,
      p_reply_to_id
    )
    returning id into v_message_id;

    update public.dm_thread_members
    set
      last_read_sequence = greatest(last_read_sequence, v_sequence),
      updated_at = now()
    where thread_id = p_thread_id
      and user_id = p_sender_id;

    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'message.changed',
      'dm_thread',
      p_thread_id::text,
      jsonb_build_object(
        'thread_id', p_thread_id,
        'message_id', v_message_id,
        'sender_id', p_sender_id,
        'recipient_id', v_peer_id,
        'sequence', v_sequence,
        'action', 'sent'
      )
    );
  end if;

  select to_jsonb(message.*) || jsonb_build_object(
    'sender', to_jsonb(sender.*),
    'reply_to', case when message.reply_to_id is not null then (
      select jsonb_build_object(
        'id', reply.id,
        'sender_id', reply.sender_id,
        'content', reply.content
      )
      from public.dm_messages reply
      where reply.id = message.reply_to_id
    ) else null end
  )
  into v_message
  from public.dm_messages message
  join public.profiles sender on sender.id = message.sender_id
  where message.id = v_message_id;

  return jsonb_build_object(
    'message', v_message,
    'deduplicated', exists (
      select 1
      from public.dm_messages message
      where message.id = v_message_id
        and message.created_at < now() - interval '1 millisecond'
    )
  );
end;
$$;

revoke all on function public.send_message_transactional(uuid, uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.send_message_transactional(uuid, uuid, uuid, text, text, text, text, uuid)
  to service_role;

create or replace function public.enqueue_dm_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_recipient_id uuid;
begin
  if old.is_deleted is distinct from new.is_deleted and new.is_deleted then
    v_action := 'deleted';
  elsif old.content is distinct from new.content
     or old.is_edited is distinct from new.is_edited then
    v_action := 'edited';
  else
    return new;
  end if;

  select case
    when thread.participant_1_id = new.sender_id then thread.participant_2_id
    else thread.participant_1_id
  end
  into v_recipient_id
  from public.dm_threads thread
  where thread.id = new.thread_id;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'message.changed',
    'dm_thread',
    new.thread_id::text,
    jsonb_build_object(
      'thread_id', new.thread_id,
      'message_id', new.id,
      'sender_id', new.sender_id,
      'recipient_id', v_recipient_id,
      'sequence', new.sequence,
      'action', v_action
    )
  );

  return new;
end;
$$;

drop trigger if exists enqueue_dm_message_update_after_change on public.dm_messages;
create trigger enqueue_dm_message_update_after_change
after update of content, is_edited, is_deleted on public.dm_messages
for each row execute function public.enqueue_dm_message_update();

create or replace function public.mark_thread_read_sequence(
  p_thread_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
begin
  select thread.next_message_sequence
  into v_sequence
  from public.dm_threads thread
  join public.dm_thread_members member
    on member.thread_id = thread.id
   and member.user_id = p_user_id
  where thread.id = p_thread_id
  for update of member;

  if not found then
    return jsonb_build_object('error', 'THREAD_NOT_FOUND');
  end if;

  update public.dm_thread_members
  set
    last_read_sequence = greatest(last_read_sequence, v_sequence),
    updated_at = now()
  where thread_id = p_thread_id
    and user_id = p_user_id;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  select
    'message.changed',
    'dm_thread',
    p_thread_id::text,
    jsonb_build_object(
      'thread_id', p_thread_id,
      'actor_id', p_user_id,
      'recipient_id', case
        when thread.participant_1_id = p_user_id then thread.participant_2_id
        else thread.participant_1_id
      end,
      'sequence', v_sequence,
      'action', 'read'
    )
  from public.dm_threads thread
  where thread.id = p_thread_id;

  return jsonb_build_object(
    'success', true,
    'last_read_sequence', v_sequence
  );
end;
$$;

revoke all on function public.mark_thread_read_sequence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_thread_read_sequence(uuid, uuid)
  to service_role;

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  stripe_customer_id text,
  storage_objects jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'dead')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.account_deletion_jobs enable row level security;
drop policy if exists "account deletion jobs are server only" on public.account_deletion_jobs;
create policy "account deletion jobs are server only"
  on public.account_deletion_jobs
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.account_deletion_jobs from anon, authenticated;
grant all on public.account_deletion_jobs to service_role;

create or replace function public.queue_account_deletion(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_storage_objects jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erasure jsonb;
  v_job_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  insert into public.account_deletion_jobs (
    user_id,
    stripe_customer_id,
    storage_objects
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    coalesce(p_storage_objects, '[]'::jsonb)
  )
  on conflict (user_id) do update
  set
    stripe_customer_id = coalesce(
      public.account_deletion_jobs.stripe_customer_id,
      excluded.stripe_customer_id
    ),
    storage_objects = case
      when public.account_deletion_jobs.storage_objects = '[]'::jsonb
        then excluded.storage_objects
      else public.account_deletion_jobs.storage_objects
    end
  returning id into v_job_id;

  v_erasure := public.erase_account_data(p_user_id);
  if coalesce((v_erasure ->> 'success')::boolean, false) is false then
    return v_erasure;
  end if;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'account.cleanup',
    'account_deletion',
    v_job_id::text,
    jsonb_build_object('job_id', v_job_id, 'user_id', p_user_id)
  );

  return jsonb_build_object(
    'success', true,
    'queued', true,
    'job_id', v_job_id
  );
end;
$$;

revoke all on function public.queue_account_deletion(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.queue_account_deletion(uuid, text, jsonb)
  to service_role;

-- Retention is bounded to avoid a single large WAL/vacuum spike.
create or replace function public.cleanup_completed_workflow_rows(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with removable as (
    select id
    from public.outbox_events
    where status = 'completed'
      and completed_at < now() - interval '14 days'
    order by completed_at asc
    limit greatest(1, least(p_limit, 5000))
  )
  delete from public.outbox_events event
  using removable
  where event.id = removable.id;
  get diagnostics v_count = row_count;

  delete from public.idempotency_records
  where ctid in (
    select ctid
    from public.idempotency_records
    where expires_at < now()
    limit greatest(1, least(p_limit, 5000))
  );

  return v_count;
end;
$$;

revoke all on function public.cleanup_completed_workflow_rows(integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_completed_workflow_rows(integer)
  to service_role;

-- Location writes and reads are API-only. RLS remains enabled as defense in depth.
drop policy if exists "user locations are server only" on public.user_locations;
create policy "user locations are server only"
  on public.user_locations
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.user_locations from anon, authenticated;
grant all on public.user_locations to service_role;

-- Remove the legacy global Presence topic and authorize only private,
-- user-scoped synchronization or member-scoped call/typing topics.
drop policy if exists "authenticated realtime topic read" on realtime.messages;
drop policy if exists "authenticated user sync topic read" on realtime.messages;
drop policy if exists "authenticated realtime topic write" on realtime.messages;

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
  );

create policy "authenticated scoped realtime write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'broadcast'
    and (
      (
        (select realtime.topic()) like 'call:%'
        or (select realtime.topic()) like 'thread:%'
      )
      and app_private.can_access_dm_thread(
        split_part((select realtime.topic()), ':', 2)
      )
    )
  );
