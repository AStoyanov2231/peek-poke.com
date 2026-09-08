-- Explicit, Plan-scoped mutual confirmations.
-- This is intentionally separate from generic pair/day meetup acknowledgements.
create table public.plan_meetup_acknowledgements (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  user_a_confirmed_at timestamptz,
  user_b_confirmed_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (user_a_id < user_b_id),
  check (user_a_confirmed_at is not null or user_b_confirmed_at is not null),
  check ((confirmed_at is null) = (user_a_confirmed_at is null or user_b_confirmed_at is null)),
  unique (plan_id, user_a_id, user_b_id)
);

create index plan_meetup_acknowledgements_confirmed_at_idx
  on public.plan_meetup_acknowledgements (confirmed_at)
  where confirmed_at is not null;

alter table public.plan_meetup_acknowledgements enable row level security;
revoke all on public.plan_meetup_acknowledgements from public, anon, authenticated;
grant all on public.plan_meetup_acknowledgements to service_role;

create or replace function public.plan_meetup_status_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_closes_at timestamptz;
  v_acknowledgements jsonb;
  v_can_confirm boolean;
begin
  select plan.* into v_plan
  from public.plans plan
  join public.plan_members actor_member
    on actor_member.plan_id = plan.id and actor_member.user_id = p_actor_id
  join public.profiles actor_profile
    on actor_profile.id = p_actor_id and actor_profile.deleted_at is null
  where plan.id = p_plan_id;

  if v_plan.id is null then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if v_plan.status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'acknowledgements', '[]'::jsonb,
      'canConfirm', false,
      'closesAt', null
    );
  end if;

  v_closes_at := v_plan.starts_at + interval '48 hours';
  select coalesce(jsonb_agg(jsonb_build_object(
    'peerId', peer_member.user_id,
    'viewerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_a_confirmed_at is not null
           else acknowledgement.user_b_confirmed_at is not null end,
      false
    ),
    'peerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_b_confirmed_at is not null
           else acknowledgement.user_a_confirmed_at is not null end,
      false
    ),
    'confirmedAt', acknowledgement.confirmed_at
  ) order by peer_member.joined_at), '[]'::jsonb)
  into v_acknowledgements
  from public.plan_members peer_member
  join public.profiles peer_profile
    on peer_profile.id = peer_member.user_id and peer_profile.deleted_at is null
  left join public.plan_meetup_acknowledgements acknowledgement
    on acknowledgement.plan_id = v_plan.id
   and ((acknowledgement.user_a_id = least(p_actor_id, peer_member.user_id)
         and acknowledgement.user_b_id = greatest(p_actor_id, peer_member.user_id)))
  where peer_member.plan_id = v_plan.id
    and peer_member.user_id <> p_actor_id
    and not exists (
      select 1 from public.user_blocks block
      where (block.blocker_id = p_actor_id and block.blocked_id = peer_member.user_id)
         or (block.blocker_id = peer_member.user_id and block.blocked_id = p_actor_id)
    );

  v_can_confirm := v_plan.starts_at <= pg_catalog.now()
    and v_closes_at > pg_catalog.now()
    and jsonb_array_length(v_acknowledgements) > 0;

  return pg_catalog.jsonb_build_object(
    'acknowledgements', v_acknowledgements,
    'canConfirm', v_can_confirm,
    'closesAt', v_closes_at
  );
end;
$$;

create or replace function public.plan_meetup_finish_v1(
  p_actor_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_body jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.idempotency_records
  set response_status = case when p_body ? 'error' then 409 else 200 end,
      response_body = p_body
  where actor_id = p_actor_id
    and operation = 'plan:meetup:acknowledge'
    and key = p_idempotency_key
    and request_hash = p_request_hash;
  return p_body;
end;
$$;

create or replace function public.plan_meetup_acknowledge_v1(
  p_actor_id uuid,
  p_plan_id uuid,
  p_peer_id uuid,
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
  v_plan public.plans%rowtype;
  v_ack public.plan_meetup_acknowledgements%rowtype;
  v_user_a uuid;
  v_user_b uuid;
  v_is_a boolean;
  v_closes_at timestamptz;
  v_payload jsonb;
begin
  if p_actor_id is null or p_plan_id is null or p_peer_id is null or p_actor_id = p_peer_id
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('error', 'INVALID');
  end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, 'plan:meetup:acknowledge', p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;
  select * into v_stored from public.idempotency_records
  where actor_id = p_actor_id
    and operation = 'plan:meetup:acknowledge'
    and key = p_idempotency_key
  for update;
  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_CONFLICT');
  end if;
  if v_stored.response_body is not null then
    return v_stored.response_body;
  end if;

  v_user_a := least(p_actor_id, p_peer_id);
  v_user_b := greatest(p_actor_id, p_peer_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_plan_id::text || ':' || v_user_a::text || ':' || v_user_b::text, 0)
  );

  select plan.* into v_plan from public.plans plan where plan.id = p_plan_id for update;
  if v_plan.id is null then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'NOT_FOUND'));
  end if;
  if v_plan.status <> 'active' then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'CANCELLED'));
  end if;
  v_closes_at := v_plan.starts_at + interval '48 hours';
  if v_plan.starts_at > pg_catalog.now() then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'MEETUP_NOT_READY'));
  end if;
  if v_closes_at <= pg_catalog.now() then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'MEETUP_CLOSED'));
  end if;
  if not exists (select 1 from public.plan_members where plan_id = p_plan_id and user_id = p_actor_id)
     or not exists (select 1 from public.plan_members where plan_id = p_plan_id and user_id = p_peer_id)
     or not exists (select 1 from public.profiles where id = p_actor_id and deleted_at is null)
     or not exists (select 1 from public.profiles where id = p_peer_id and deleted_at is null)
     or exists (
       select 1 from public.user_blocks block
       where (block.blocker_id = p_actor_id and block.blocked_id = p_peer_id)
          or (block.blocker_id = p_peer_id and block.blocked_id = p_actor_id)
     ) then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'NOT_FOUND'));
  end if;

  select * into v_ack from public.plan_meetup_acknowledgements acknowledgement
  where acknowledgement.plan_id = p_plan_id
    and acknowledgement.user_a_id = v_user_a
    and acknowledgement.user_b_id = v_user_b
  for update;
  v_is_a := p_actor_id = v_user_a;
  if v_ack.id is null then
    insert into public.plan_meetup_acknowledgements (
      plan_id, user_a_id, user_b_id, user_a_confirmed_at, user_b_confirmed_at, expires_at
    ) values (
      p_plan_id, v_user_a, v_user_b,
      case when v_is_a then pg_catalog.now() else null end,
      case when v_is_a then null else pg_catalog.now() end,
      v_closes_at
    );
  elsif v_ack.confirmed_at is null then
    update public.plan_meetup_acknowledgements acknowledgement
    set user_a_confirmed_at = case when v_is_a then coalesce(acknowledgement.user_a_confirmed_at, pg_catalog.now()) else acknowledgement.user_a_confirmed_at end,
        user_b_confirmed_at = case when v_is_a then acknowledgement.user_b_confirmed_at else coalesce(acknowledgement.user_b_confirmed_at, pg_catalog.now()) end,
        confirmed_at = case
          when (acknowledgement.user_a_confirmed_at is not null or v_is_a)
           and (acknowledgement.user_b_confirmed_at is not null or not v_is_a)
          then pg_catalog.now()
          else null
        end,
        updated_at = pg_catalog.now()
    where acknowledgement.id = v_ack.id;
  end if;

  v_payload := public.plan_meetup_status_v1(p_actor_id, p_plan_id);
  return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

revoke all on function public.plan_meetup_status_v1(uuid, uuid), public.plan_meetup_finish_v1(uuid, text, text, jsonb), public.plan_meetup_acknowledge_v1(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_meetup_status_v1(uuid, uuid), public.plan_meetup_acknowledge_v1(uuid, uuid, uuid, text, text) to service_role;

drop function public.product_private_activity_metrics(date, date);
create function public.product_private_activity_metrics(p_start date, p_end date)
returns table (
  metric_day date,
  first_activations bigint,
  weekly_active_users bigint,
  opportunities_2km bigint,
  opportunities_10km bigint,
  opportunities_25km bigint,
  plan_confirmation_started_pairs bigint,
  plan_to_mutual_confirmed bigint,
  plan_conversion_attribution_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 30 then
    raise exception 'metric range must be between one and thirty-one UTC days' using errcode = '22023';
  end if;

  return query
  with days as (
    select d::date as metric_day
    from pg_catalog.generate_series(p_start, p_end, interval '1 day') as d
  )
  select
    d.metric_day,
    (select count(*)::bigint from public.product_first_activations a where a.activated_at::date = d.metric_day),
    (select count(distinct x.user_id)::bigint from public.product_activity_days x where x.activity_day between (d.metric_day - 6) and d.metric_day),
    coalesce((select sum(q.opportunities_2km)::bigint from public.product_discovery_daily_activity q where q.activity_day = d.metric_day), 0::bigint),
    coalesce((select sum(q.opportunities_10km)::bigint from public.product_discovery_daily_activity q where q.activity_day = d.metric_day), 0::bigint),
    coalesce((select sum(q.opportunities_25km)::bigint from public.product_discovery_daily_activity q where q.activity_day = d.metric_day), 0::bigint),
    (select count(*)::bigint from public.plan_meetup_acknowledgements acknowledgement where acknowledgement.created_at::date = d.metric_day),
    (select count(*)::bigint from public.plan_meetup_acknowledgements acknowledgement where acknowledgement.confirmed_at::date = d.metric_day),
    true
  from days d;
end;
$$;

revoke all on function public.product_private_activity_metrics(date, date) from public, anon, authenticated;
grant execute on function public.product_private_activity_metrics(date, date) to service_role;

-- A Plan conversion is a Plan-level cohort metric, not a pair-confirmation event metric.
-- Cancellations stay in the denominator because the cohort is the originally scheduled Plan.
create function public.product_plan_conversion_metrics(p_start date, p_end date)
returns table (
  plan_start_day date,
  scheduled_plans bigint,
  mutually_confirmed_plans bigint,
  conversion_rate numeric,
  confirmation_window_closed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 30 then
    raise exception 'metric range must be between one and thirty-one UTC days' using errcode = '22023';
  end if;

  return query
  with days as (
    select d::date as plan_start_day
    from pg_catalog.generate_series(p_start, p_end, interval '1 day') as d
  ), cohorts as (
    select
      d.plan_start_day,
      count(plan.id)::bigint as scheduled_plans,
      count(plan.id) filter (
        where exists (
          select 1
          from public.plan_meetup_acknowledgements acknowledgement
          where acknowledgement.plan_id = plan.id
            and acknowledgement.confirmed_at is not null
        )
      )::bigint as mutually_confirmed_plans
    from days d
    left join public.plans plan
      on plan.starts_at >= (d.plan_start_day::timestamp at time zone 'UTC')
     and plan.starts_at < ((d.plan_start_day + 1)::timestamp at time zone 'UTC')
    group by d.plan_start_day
  )
  select
    cohort.plan_start_day,
    cohort.scheduled_plans,
    cohort.mutually_confirmed_plans,
    case when cohort.scheduled_plans = 0 then null
         else cohort.mutually_confirmed_plans::numeric / cohort.scheduled_plans::numeric end,
    ((cohort.plan_start_day + 1)::timestamp at time zone 'UTC') + interval '48 hours' <= pg_catalog.now()
  from cohorts cohort;
end;
$$;

revoke all on function public.product_plan_conversion_metrics(date, date) from public, anon, authenticated;
grant execute on function public.product_plan_conversion_metrics(date, date) to service_role;
