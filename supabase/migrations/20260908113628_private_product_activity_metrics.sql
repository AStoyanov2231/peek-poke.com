-- Private, service-only aggregate inputs for the product metrics brief.
-- These records never contain names, message content, or coordinates.
create table public.product_first_activations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  activated_at timestamptz not null default pg_catalog.now(),
  source text not null check (source in ('availability', 'poke'))
);

create table public.product_activity_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_day date not null,
  kind text not null check (kind in ('availability', 'poke', 'discovery', 'plan', 'meetup')),
  primary key (user_id, activity_day, kind)
);

create table public.product_discovery_daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_day date not null,
  opportunities_2km smallint not null check (opportunities_2km between 0 and 100),
  opportunities_10km smallint not null check (opportunities_10km between 0 and 100),
  opportunities_25km smallint not null check (opportunities_25km between 0 and 100),
  observed_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, activity_day)
);

alter table public.product_first_activations enable row level security;
alter table public.product_activity_days enable row level security;
alter table public.product_discovery_daily_activity enable row level security;

revoke all on public.product_first_activations, public.product_activity_days, public.product_discovery_daily_activity from public, anon, authenticated;
grant all on public.product_first_activations, public.product_activity_days, public.product_discovery_daily_activity to service_role;

create or replace function public.record_product_activation_v1(p_user_id uuid, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source is null or p_source not in ('availability', 'poke') then
    raise exception 'invalid activation source';
  end if;

  insert into public.product_first_activations (user_id, source)
  values (p_user_id, p_source)
  on conflict (user_id) do nothing;

  insert into public.product_activity_days (user_id, activity_day, kind)
  values (p_user_id, (pg_catalog.now() at time zone 'UTC')::date, p_source)
  on conflict do nothing;
end;
$$;

-- Pokes can be created by server-side RPCs as well as HTTP routes.
-- Recording here preserves first activation without relying on a mutable current-availability row.
create or replace function public.product_poke_activation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_product_activation_v1(new.sender_id, 'poke');
  return new;
end;
$$;

drop trigger if exists product_poke_activation_v1 on public.pokes;
create trigger product_poke_activation_v1
after insert on public.pokes
for each row execute function public.product_poke_activation_v1();

create or replace function public.record_product_discovery_v1(
  p_user_id uuid,
  p_2 smallint,
  p_10 smallint,
  p_25 smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.now() at time zone 'UTC')::date;
begin
  insert into public.product_discovery_daily_activity (
    user_id, activity_day, opportunities_2km, opportunities_10km, opportunities_25km, observed_at
  ) values (
    p_user_id,
    v_day,
    greatest(0::smallint, least(p_2, 100::smallint)),
    greatest(0::smallint, least(p_10, 100::smallint)),
    greatest(0::smallint, least(p_25, 100::smallint)),
    pg_catalog.now()
  ) on conflict (user_id, activity_day) do update set
    opportunities_2km = greatest(public.product_discovery_daily_activity.opportunities_2km, excluded.opportunities_2km),
    opportunities_10km = greatest(public.product_discovery_daily_activity.opportunities_10km, excluded.opportunities_10km),
    opportunities_25km = greatest(public.product_discovery_daily_activity.opportunities_25km, excluded.opportunities_25km),
    observed_at = excluded.observed_at;

  insert into public.product_activity_days (user_id, activity_day, kind)
  values (p_user_id, v_day, 'discovery')
  on conflict do nothing;
end;
$$;

-- This is safe for a scheduled, service-only cleanup worker.
-- First activations are intentionally retained for cohort analysis.
create or replace function public.purge_product_daily_activity_v1(p_keep_days integer default 31)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep_days integer := greatest(1, least(p_keep_days, 366));
  v_cutoff date := ((pg_catalog.now() at time zone 'UTC')::date - v_keep_days);
begin
  delete from public.product_discovery_daily_activity where activity_day < v_cutoff;
  delete from public.product_activity_days where activity_day < v_cutoff;
end;
$$;

create or replace function public.product_private_activity_metrics(p_start date, p_end date)
returns table (
  metric_day date,
  first_activations bigint,
  weekly_active_users bigint,
  opportunities_2km bigint,
  opportunities_10km bigint,
  opportunities_25km bigint,
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
    null::bigint,
    false
  from days d;
end;
$$;

revoke all on function public.record_product_activation_v1(uuid, text), public.product_poke_activation_v1(), public.record_product_discovery_v1(uuid, smallint, smallint, smallint), public.purge_product_daily_activity_v1(integer), public.product_private_activity_metrics(date, date) from public, anon, authenticated;
grant execute on function public.record_product_activation_v1(uuid, text), public.record_product_discovery_v1(uuid, smallint, smallint, smallint), public.purge_product_daily_activity_v1(integer), public.product_private_activity_metrics(date, date) to service_role;
