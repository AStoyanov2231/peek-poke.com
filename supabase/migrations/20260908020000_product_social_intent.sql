-- Product redesign: expiring availability and contextual Pokes.
--
-- This checkout intentionally has no ordered Supabase schema history. Apply this
-- only after comparing these assumptions against an isolated `supabase db pull`:
--   profiles(id uuid, deleted_at timestamptz)
--   user_blocks(blocker_id uuid, blocked_id uuid)
--   friendships(requester_id uuid, addressee_id uuid, status text)
--   user_locations(user_id uuid, lat double precision, lng double precision, updated_at timestamptz)
--   profile_interests(user_id uuid, tag_id uuid), interest_tags(id uuid, name text)
--   create_or_find_thread(p_user_a uuid, p_user_b uuid) returns jsonb with `id`.
-- `user_locations` remains server-only and location results are rounded before
-- leaving the database. Do not grant direct table access to app clients.

do $$ begin
  create type public.social_activity as enum ('coffee', 'food', 'walk', 'gym', 'study', 'drinks', 'gaming', 'explore', 'anything', 'custom');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.poke_status as enum ('pending', 'accepted', 'later', 'declined', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_availabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  activity public.social_activity not null,
  custom_label text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_availabilities_window check (expires_at > created_at and expires_at <= created_at + interval '12 hours'),
  constraint user_availabilities_custom_label check (
    (activity = 'custom' and char_length(btrim(custom_label)) between 1 and 48)
    or (activity <> 'custom' and custom_label is null)
  )
);
create index if not exists user_availabilities_active_idx on public.user_availabilities (expires_at, user_id);

create table if not exists public.pokes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  activity public.social_activity not null,
  custom_label text,
  note text,
  status public.poke_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  thread_id uuid references public.dm_threads(id) on delete set null,
  constraint pokes_distinct_people check (sender_id <> recipient_id),
  constraint pokes_note check (note is null or char_length(btrim(note)) between 1 and 280),
  constraint pokes_custom_label check (
    (activity = 'custom' and char_length(btrim(custom_label)) between 1 and 48)
    or (activity <> 'custom' and custom_label is null)
  ),
  constraint pokes_response_state check (
    (status = 'pending' and responded_at is null and thread_id is null)
    or (status = 'accepted' and responded_at is not null and thread_id is not null)
    or (status in ('later', 'declined', 'expired') and responded_at is not null and thread_id is null)
  )
);
create index if not exists pokes_recipient_active_idx on public.pokes (recipient_id, expires_at desc) where status = 'pending';
create index if not exists pokes_sender_active_idx on public.pokes (sender_id, expires_at desc) where status = 'pending';

create table if not exists public.social_idempotency_records (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in ('create_poke', 'respond_to_poke')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  request_fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, idempotency_key)
);

alter table public.user_availabilities enable row level security;
alter table public.pokes enable row level security;
alter table public.social_idempotency_records enable row level security;
revoke all on public.user_availabilities, public.pokes, public.social_idempotency_records from anon, authenticated;

create or replace function public.social_availability_json(p_row public.user_availabilities)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', p_row.id, 'userId', p_row.user_id, 'activity', p_row.activity,
    'customLabel', p_row.custom_label, 'expiresAt', to_char(p_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt', to_char(p_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(p_row.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
$$;

create or replace function public.social_poke_json(p_row public.pokes)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', p_row.id, 'senderId', p_row.sender_id, 'recipientId', p_row.recipient_id,
    'activity', p_row.activity, 'customLabel', p_row.custom_label, 'note', p_row.note, 'status', p_row.status,
    'expiresAt', to_char(p_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt', to_char(p_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'respondedAt', case when p_row.responded_at is null then null else to_char(p_row.responded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'threadId', p_row.thread_id);
$$;

create or replace function public.upsert_user_availability(p_user_id uuid, p_activity public.social_activity, p_custom_label text, p_duration_minutes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.user_availabilities;
begin
  if p_duration_minutes not between 15 and 720 or (p_activity = 'custom' and char_length(btrim(coalesce(p_custom_label, ''))) not between 1 and 48) or (p_activity <> 'custom' and p_custom_label is not null) then
    raise exception 'invalid availability input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and deleted_at is null) then raise exception 'unknown user' using errcode = 'P0002'; end if;
  insert into public.user_availabilities (user_id, activity, custom_label, expires_at)
  values (p_user_id, p_activity, nullif(btrim(p_custom_label), ''), now() + make_interval(mins => p_duration_minutes))
  on conflict (user_id) do update set activity = excluded.activity, custom_label = excluded.custom_label, expires_at = excluded.expires_at, updated_at = now()
  returning * into v_row;
  return jsonb_build_object('availability', public.social_availability_json(v_row));
end $$;

create or replace function public.clear_user_availability(p_user_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  delete from public.user_availabilities where user_id = p_user_id; select true;
$$;

create or replace function public.get_available_people(p_viewer_id uuid, p_limit integer default 20, p_radius_km integer default 25)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_self public.user_availabilities; v_people jsonb;
begin
  if p_limit not between 1 and 100 or p_radius_km not between 2 and 25 then raise exception 'invalid discovery bounds' using errcode = '22023'; end if;
  select * into v_self from public.user_availabilities where user_id = p_viewer_id and expires_at > now();
  select coalesce(jsonb_agg(row.payload order by row.intent_match desc, row.is_friend desc, row.shared_interest_count desc, row.distance_km, row.expires_at), '[]'::jsonb) into v_people
  from (
    select candidate.*, greatest(2, ceil(candidate.snapped_distance_km / 2.0) * 2)::float8 as distance_km,
      jsonb_build_object(
        'profile', jsonb_build_object('id', candidate.profile_id, 'username', candidate.username, 'display_name', candidate.display_name, 'avatar_url', candidate.avatar_url, 'location_text', candidate.location_text, 'is_online', candidate.is_online, 'last_seen_at', candidate.last_seen_at),
        'availability', public.social_availability_json(candidate.availability_row),
         'distanceKm', greatest(2, ceil(candidate.snapped_distance_km / 2.0) * 2)::float8,
         'relationship', case when candidate.is_friend then 'friend' else 'none' end,
         'sharedInterestNames', candidate.shared_interest_names
      ) as payload
    from (
      select a as availability_row, a.expires_at, p.id as profile_id, p.username, p.display_name, p.avatar_url, p.location_text, p.is_online, p.last_seen_at, case when f.requester_id is null then false else true end as is_friend,
        case when v_self.activity = 'anything' or a.activity = 'anything' or v_self.activity = a.activity then 1 else 0 end as intent_match,
        coalesce(shared.names, '[]'::jsonb) as shared_interest_names,
        coalesce(jsonb_array_length(shared.names), 0) as shared_interest_count,
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(round(vl.lat::numeric, 2)))
              * cos(radians(round(other.lat::numeric, 2)))
              * cos(radians(round(other.lng::numeric, 2)) - radians(round(vl.lng::numeric, 2)))
            + sin(radians(round(vl.lat::numeric, 2)))
              * sin(radians(round(other.lat::numeric, 2)))
          ))
        ) as snapped_distance_km
      from public.user_availabilities a
      join public.profiles p on p.id = a.user_id and p.deleted_at is null
      join public.user_locations vl on vl.user_id = p_viewer_id and vl.updated_at > now() - interval '15 minutes'
      join public.user_locations other on other.user_id = a.user_id and other.updated_at > now() - interval '15 minutes'
      left join public.friendships f on f.status = 'accepted' and ((f.requester_id = p_viewer_id and f.addressee_id = p.id) or (f.addressee_id = p_viewer_id and f.requester_id = p.id))
      left join lateral (select jsonb_agg(t.name order by t.name) as names from public.profile_interests mine join public.profile_interests theirs on theirs.tag_id = mine.tag_id and theirs.user_id = p.id join public.interest_tags t on t.id = mine.tag_id where mine.user_id = p_viewer_id) shared on true
      where a.user_id <> p_viewer_id and a.expires_at > now()
        and not exists (select 1 from public.user_blocks b where (b.blocker_id = p_viewer_id and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = p_viewer_id))
    ) candidate
    where candidate.snapped_distance_km <= p_radius_km
    order by candidate.intent_match desc, candidate.is_friend desc, candidate.shared_interest_count desc, candidate.snapped_distance_km, candidate.expires_at limit p_limit
  ) row;
  return jsonb_build_object('availability', case when v_self.id is null then null else public.social_availability_json(v_self) end, 'people', v_people);
end $$;

create or replace function public.social_idempotency_finish(p_actor_id uuid, p_operation text, p_idempotency_key text, p_fingerprint text, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.social_idempotency_records(actor_id, operation, idempotency_key, request_fingerprint, response)
  values (p_actor_id, p_operation, p_idempotency_key, p_fingerprint, p_response);
  return p_response;
end;
$$;

-- The outbox contains only opaque identifiers. The worker calls this immediately
-- before fanout so a block, expiry, deleted account, or revoked accepted Poke
-- suppresses both realtime and lock-screen delivery.
create or replace function public.authorize_poke_delivery(
  p_poke_id uuid,
  p_action text,
  p_sender_id uuid,
  p_recipient_id uuid,
  p_thread_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poke public.pokes%rowtype;
begin
  if p_action not in ('received', 'accepted') then
    raise exception 'invalid Poke delivery action' using errcode = '22023';
  end if;
  select * into v_poke from public.pokes where id = p_poke_id;
  if v_poke.id is null
     or v_poke.sender_id <> p_sender_id
     or v_poke.recipient_id <> p_recipient_id
     or not exists (select 1 from public.profiles where id = p_sender_id and deleted_at is null)
     or not exists (select 1 from public.profiles where id = p_recipient_id and deleted_at is null)
     or exists (
       select 1 from public.user_blocks block
       where (block.blocker_id = p_sender_id and block.blocked_id = p_recipient_id)
          or (block.blocker_id = p_recipient_id and block.blocked_id = p_sender_id)
     ) then
    return jsonb_build_object('deliver', false);
  end if;
  if p_action = 'received' then
    return jsonb_build_object('deliver', v_poke.status = 'pending' and v_poke.expires_at > pg_catalog.now());
  end if;
  if v_poke.status <> 'accepted' or v_poke.thread_id is null or v_poke.thread_id <> p_thread_id
     or not exists (
       select 1 from public.dm_thread_members member
       where member.thread_id = v_poke.thread_id and member.user_id = p_sender_id
     )
     or not exists (
       select 1 from public.dm_thread_members member
       where member.thread_id = v_poke.thread_id and member.user_id = p_recipient_id
     ) then
    return jsonb_build_object('deliver', false);
  end if;
  return jsonb_build_object('deliver', true, 'threadId', v_poke.thread_id);
end;
$$;

create or replace function public.create_poke(p_sender_id uuid, p_recipient_id uuid, p_activity public.social_activity, p_custom_label text, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_fingerprint text := concat_ws('|', p_recipient_id, p_activity, coalesce(p_custom_label, ''), coalesce(p_note, '')); v_cached public.social_idempotency_records; v_poke public.pokes;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':create_poke:' || p_idempotency_key, 0));
  select * into v_cached from public.social_idempotency_records where actor_id = p_sender_id and operation = 'create_poke' and idempotency_key = p_idempotency_key for update;
  if found then if v_cached.request_fingerprint <> v_fingerprint then return jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED'); end if; return v_cached.response || jsonb_build_object('replayed', true); end if;
  if p_sender_id = p_recipient_id then return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'SELF_TARGET')); end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id and deleted_at is null) then return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'USER_NOT_FOUND')); end if;
  if exists (select 1 from public.user_blocks where (blocker_id = p_sender_id and blocked_id = p_recipient_id) or (blocker_id = p_recipient_id and blocked_id = p_sender_id)) then return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'BLOCKED')); end if;
  insert into public.pokes (sender_id, recipient_id, activity, custom_label, note) values (p_sender_id, p_recipient_id, p_activity, nullif(btrim(p_custom_label), ''), nullif(btrim(p_note), '')) returning * into v_poke;
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values ('poke.created', 'poke', v_poke.id::text, jsonb_build_object('poke_id', v_poke.id, 'sender_id', v_poke.sender_id, 'recipient_id', v_poke.recipient_id, 'action', 'received'))
  on conflict (event_type, aggregate_id) where event_type = 'poke.created' do nothing;
  return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('poke', public.social_poke_json(v_poke), 'replayed', false));
end $$;

create or replace function public.get_active_pokes(p_user_id uuid, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_received jsonb; v_sent jsonb;
begin
  if p_limit not between 1 and 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  update public.pokes set status = 'expired', responded_at = now() where status = 'pending' and expires_at <= now() and (sender_id = p_user_id or recipient_id = p_user_id);
  select coalesce(jsonb_agg(public.social_poke_json(p) || jsonb_build_object('sender', jsonb_build_object('id', sender.id, 'username', sender.username, 'display_name', sender.display_name, 'avatar_url', sender.avatar_url, 'location_text', sender.location_text, 'is_online', sender.is_online, 'last_seen_at', sender.last_seen_at)) order by p.created_at desc), '[]'::jsonb) into v_received from (select * from public.pokes where recipient_id = p_user_id and status = 'pending' and expires_at > now() and not exists (select 1 from public.user_blocks b where (b.blocker_id = p_user_id and b.blocked_id = pokes.sender_id) or (b.blocker_id = pokes.sender_id and b.blocked_id = p_user_id)) order by created_at desc limit p_limit) p join public.profiles sender on sender.id = p.sender_id and sender.deleted_at is null;
  select coalesce(jsonb_agg(public.social_poke_json(p) || jsonb_build_object('recipient', jsonb_build_object('id', recipient.id, 'username', recipient.username, 'display_name', recipient.display_name, 'avatar_url', recipient.avatar_url, 'location_text', recipient.location_text, 'is_online', recipient.is_online, 'last_seen_at', recipient.last_seen_at)) order by p.created_at desc), '[]'::jsonb) into v_sent from (select * from public.pokes where sender_id = p_user_id and status = 'pending' and expires_at > now() and not exists (select 1 from public.user_blocks b where (b.blocker_id = p_user_id and b.blocked_id = pokes.recipient_id) or (b.blocker_id = pokes.recipient_id and b.blocked_id = p_user_id)) order by created_at desc limit p_limit) p join public.profiles recipient on recipient.id = p.recipient_id and recipient.deleted_at is null;
  return jsonb_build_object('received', v_received, 'sent', v_sent);
end $$;

create or replace function public.respond_to_poke(p_recipient_id uuid, p_poke_id uuid, p_action text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_fingerprint text := concat_ws('|', p_poke_id, p_action); v_cached public.social_idempotency_records; v_poke public.pokes; v_thread_id uuid; v_response jsonb;
begin
  if p_action not in ('accept', 'later', 'decline') then raise exception 'invalid action' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recipient_id::text || ':respond_to_poke:' || p_idempotency_key, 0));
  select * into v_cached from public.social_idempotency_records where actor_id = p_recipient_id and operation = 'respond_to_poke' and idempotency_key = p_idempotency_key for update;
  if found then if v_cached.request_fingerprint <> v_fingerprint then return jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED'); end if; return v_cached.response || jsonb_build_object('replayed', true); end if;
  select * into v_poke from public.pokes where id = p_poke_id and recipient_id = p_recipient_id for update;
  if not found then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'POKE_NOT_FOUND')); end if;
  if exists (select 1 from public.user_blocks where (blocker_id = p_recipient_id and blocked_id = v_poke.sender_id) or (blocker_id = v_poke.sender_id and blocked_id = p_recipient_id)) then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'BLOCKED')); end if;
  if v_poke.status <> 'pending' then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', case when v_poke.status = 'expired' then 'POKE_EXPIRED' else 'POKE_ALREADY_RESPONDED' end)); end if;
  if v_poke.expires_at <= now() then update public.pokes set status = 'expired', responded_at = now() where id = v_poke.id returning * into v_poke; return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'POKE_EXPIRED')); end if;
  if p_action = 'accept' then
    -- Existing create_or_find_thread charges coins to initiate a non-friend DM.
    -- A recipient's acceptance is the explicit reciprocal consent that opens this
    -- Poke conversation, so it uses the same pair lock and member trigger without
    -- charging either participant.
    perform pg_advisory_xact_lock(hashtextextended(least(v_poke.sender_id, v_poke.recipient_id)::text || ':' || greatest(v_poke.sender_id, v_poke.recipient_id)::text, 0));
    select id into v_thread_id from public.dm_threads where participant_1_id = least(v_poke.sender_id, v_poke.recipient_id) and participant_2_id = greatest(v_poke.sender_id, v_poke.recipient_id);
    if v_thread_id is null then
      insert into public.dm_threads(participant_1_id, participant_2_id) values (least(v_poke.sender_id, v_poke.recipient_id), greatest(v_poke.sender_id, v_poke.recipient_id)) returning id into v_thread_id;
    end if;
    update public.pokes set status = 'accepted', responded_at = now(), thread_id = v_thread_id where id = v_poke.id returning * into v_poke;
    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('poke.accepted', 'poke', v_poke.id::text, jsonb_build_object('poke_id', v_poke.id, 'sender_id', v_poke.sender_id, 'recipient_id', v_poke.recipient_id, 'thread_id', v_thread_id, 'action', 'accepted'))
    on conflict (event_type, aggregate_id) where event_type = 'poke.accepted' do nothing;
    v_response := jsonb_build_object('poke', public.social_poke_json(v_poke), 'threadId', v_thread_id);
  else
    update public.pokes set status = case when p_action = 'later' then 'later'::public.poke_status else 'declined'::public.poke_status end, responded_at = now() where id = v_poke.id returning * into v_poke;
    v_response := jsonb_build_object('poke', public.social_poke_json(v_poke));
  end if;
  return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, v_response || jsonb_build_object('replayed', false));
end $$;

revoke all on function public.upsert_user_availability(uuid, public.social_activity, text, integer), public.clear_user_availability(uuid), public.get_available_people(uuid, integer, integer), public.social_idempotency_finish(uuid, text, text, text, jsonb), public.authorize_poke_delivery(uuid, text, uuid, uuid, uuid), public.create_poke(uuid, uuid, public.social_activity, text, text, text), public.get_active_pokes(uuid, integer), public.respond_to_poke(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.upsert_user_availability(uuid, public.social_activity, text, integer), public.clear_user_availability(uuid), public.get_available_people(uuid, integer, integer), public.create_poke(uuid, uuid, public.social_activity, text, text, text), public.get_active_pokes(uuid, integer), public.respond_to_poke(uuid, uuid, text, text) to service_role;
