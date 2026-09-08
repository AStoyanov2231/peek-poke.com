-- A private mutual acknowledgement is a social record, never evidence of
-- physical presence. It intentionally does not read locations or coins.
do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.user_blocks') is null
     or pg_catalog.to_regprocedure('public.meeting_pair_eligible_v1(uuid,uuid)') is null then
    raise exception 'durable idempotency and social eligibility baselines must be applied first';
  end if;
end;
$$;

create table if not exists public.meetup_acknowledgements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  meetup_day date not null,
  user_a_confirmed_at timestamptz,
  user_b_confirmed_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (user_a_id < user_b_id),
  check (user_a_confirmed_at is not null or user_b_confirmed_at is not null),
  check ((confirmed_at is null) = (user_a_confirmed_at is null or user_b_confirmed_at is null)),
  unique (user_a_id, user_b_id, meetup_day)
);

alter table public.meetup_acknowledgements enable row level security;
drop policy if exists "meetup acknowledgements are server only" on public.meetup_acknowledgements;
create policy "meetup acknowledgements are server only"
  on public.meetup_acknowledgements for all to authenticated using (false) with check (false);
revoke all on public.meetup_acknowledgements from public, anon, authenticated;
grant all on public.meetup_acknowledgements to service_role;

create or replace function public.acknowledge_meetup_idempotent(
  p_actor_id uuid,
  p_peer_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.idempotency_records%rowtype;
  v_ack public.meetup_acknowledgements%rowtype;
  v_a uuid := least(p_actor_id, p_peer_id);
  v_b uuid := greatest(p_actor_id, p_peer_id);
  v_day date := (pg_catalog.now() at time zone 'UTC')::date;
  v_expires_at timestamptz := date_trunc('day', pg_catalog.now() at time zone 'UTC') + interval '2 days';
  v_is_a boolean;
  v_status text;
  v_confirmed_at timestamptz;
  v_confirmed_transition boolean := false;
  v_body jsonb;
begin
  if p_operation is distinct from 'meetup:acknowledge'
     or p_actor_id is null or p_peer_id is null or p_actor_id = p_peer_id
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('error', 'INVALID_IDEMPOTENCY_KEY');
  end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;
  select * into v_stored from public.idempotency_records
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key
  for update;
  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
  end if;
  if v_stored.response_body is not null then
    return v_stored.response_body || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text || ':' || v_b::text || ':' || v_day::text, 0));
  if exists (select 1 from public.user_blocks block where (block.blocker_id = p_actor_id and block.blocked_id = p_peer_id) or (block.blocker_id = p_peer_id and block.blocked_id = p_actor_id)) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;
  if not public.meeting_pair_eligible_v1(p_actor_id, p_peer_id) then
    return pg_catalog.jsonb_build_object('error', 'NOT_ELIGIBLE');
  end if;

  select * into v_ack from public.meetup_acknowledgements
  where user_a_id = v_a and user_b_id = v_b and meetup_day = v_day
  for update;
  v_is_a := p_actor_id = v_a;
  if v_ack.id is null then
    insert into public.meetup_acknowledgements (
      user_a_id, user_b_id, meetup_day, user_a_confirmed_at, user_b_confirmed_at, expires_at
    ) values (
      v_a, v_b, v_day,
      case when v_is_a then pg_catalog.now() else null end,
      case when v_is_a then null else pg_catalog.now() end,
      v_expires_at
    ) returning * into v_ack;
  elsif v_ack.confirmed_at is null then
    update public.meetup_acknowledgements
    set user_a_confirmed_at = case when v_is_a then coalesce(user_a_confirmed_at, pg_catalog.now()) else user_a_confirmed_at end,
        user_b_confirmed_at = case when v_is_a then user_b_confirmed_at else coalesce(user_b_confirmed_at, pg_catalog.now()) end,
        confirmed_at = case
          when (user_a_confirmed_at is not null or v_is_a)
           and (user_b_confirmed_at is not null or not v_is_a)
            then pg_catalog.now()
          else null
        end,
        updated_at = pg_catalog.now()
    where id = v_ack.id
    returning * into v_ack;
    v_confirmed_transition := v_ack.confirmed_at is not null;
  end if;

  v_status := case when v_ack.confirmed_at is null then 'waiting' else 'confirmed' end;
  v_confirmed_at := v_ack.confirmed_at;
  v_body := pg_catalog.jsonb_build_object('meetup', pg_catalog.jsonb_build_object(
    'id', v_ack.id, 'peerId', p_peer_id, 'status', v_status,
    'viewerConfirmed', case when v_is_a then v_ack.user_a_confirmed_at is not null else v_ack.user_b_confirmed_at is not null end,
    'expiresAt', v_ack.expires_at, 'confirmedAt', v_confirmed_at
  ), 'replayed', false, 'confirmed_transition', v_confirmed_transition);
  update public.idempotency_records
  set response_status = 200, response_body = v_body
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key;
  return v_body;
end;
$$;

revoke all on function public.acknowledge_meetup_idempotent(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.acknowledge_meetup_idempotent(uuid, uuid, text, text, text) to service_role;

create or replace function public.read_meetup_acknowledgement(
  p_actor_id uuid,
  p_peer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ack public.meetup_acknowledgements%rowtype;
begin
  if p_actor_id is null or p_peer_id is null or p_actor_id = p_peer_id then
    return pg_catalog.jsonb_build_object('error', 'NOT_ELIGIBLE');
  end if;
  if exists (select 1 from public.user_blocks block where (block.blocker_id = p_actor_id and block.blocked_id = p_peer_id) or (block.blocker_id = p_peer_id and block.blocked_id = p_actor_id)) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;
  select * into v_ack from public.meetup_acknowledgements acknowledgement
  where acknowledgement.expires_at > pg_catalog.now()
    and ((acknowledgement.user_a_id = p_actor_id and acknowledgement.user_b_id = p_peer_id)
      or (acknowledgement.user_a_id = p_peer_id and acknowledgement.user_b_id = p_actor_id))
  order by acknowledgement.meetup_day desc
  limit 1;
  if v_ack.id is null then
    return pg_catalog.jsonb_build_object('meetup', null);
  end if;
  return pg_catalog.jsonb_build_object('meetup', pg_catalog.jsonb_build_object(
    'id', v_ack.id,
    'peerId', p_peer_id,
    'status', case when v_ack.confirmed_at is null then 'waiting' else 'confirmed' end,
    'viewerConfirmed', case when v_ack.user_a_id = p_actor_id then v_ack.user_a_confirmed_at is not null else v_ack.user_b_confirmed_at is not null end,
    'expiresAt', v_ack.expires_at,
    'confirmedAt', v_ack.confirmed_at
  ));
end;
$$;
revoke all on function public.read_meetup_acknowledgement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_meetup_acknowledgement(uuid, uuid) to service_role;
