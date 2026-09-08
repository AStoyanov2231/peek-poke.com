-- Private, count-only product funnel reporting. This reads durable domain state
-- rather than recording message content, names, coordinates, or client events.
do $$
begin
  if pg_catalog.to_regclass('public.user_availabilities') is null
     or pg_catalog.to_regclass('public.pokes') is null
     or pg_catalog.to_regclass('public.plans') is null
     or pg_catalog.to_regclass('public.plan_members') is null
     or pg_catalog.to_regclass('public.meetup_acknowledgements') is null then
    raise exception 'social, plans, and mutual meetup migrations must be applied first';
  end if;
end;
$$;

create index if not exists pokes_created_at_idx on public.pokes (created_at);
create index if not exists pokes_accepted_at_idx on public.pokes (responded_at) where status = 'accepted';
create index if not exists plans_created_at_idx on public.plans (created_at);
create index if not exists plan_join_idempotency_created_at_idx on public.plan_join_idempotency (created_at);
create index if not exists meetup_acknowledgements_confirmed_at_idx on public.meetup_acknowledgements (confirmed_at) where confirmed_at is not null;

create or replace function public.product_daily_funnel_metrics(
  p_start_day date,
  p_end_day date default (pg_catalog.now() at time zone 'UTC')::date
)
returns table(
  metric_day date,
  activated_users bigint,
  current_availability_records_created bigint,
  pokes_sent bigint,
  pokes_accepted bigint,
  plans_created bigint,
  plans_from_accepted_pokes bigint,
  plan_joins bigint,
  mutual_meetups bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start_day is null or p_end_day is null
     or p_start_day > p_end_day
     or p_end_day - p_start_day > 30 then
    raise exception 'metric range must be between one and thirty-one UTC days' using errcode = '22023';
  end if;

  return query
  with days as (
    select day::date as metric_day
    from pg_catalog.generate_series(p_start_day, p_end_day, interval '1 day') day
  ), activation_events as (
    select poke.sender_id as user_id, (poke.created_at at time zone 'UTC')::date as metric_day
    from public.pokes poke
    union all
    select plan.owner_id, (plan.created_at at time zone 'UTC')::date as metric_day
    from public.plans plan
    union all
    select join_attempt.actor_id, (join_attempt.created_at at time zone 'UTC')::date as metric_day
    from public.plan_join_idempotency join_attempt
    where join_attempt.response_body->>'joined' = 'true'
    union all
    select acknowledgement.user_a_id, (acknowledgement.confirmed_at at time zone 'UTC')::date
    from public.meetup_acknowledgements acknowledgement
    where acknowledgement.confirmed_at is not null
    union all
    select acknowledgement.user_b_id, (acknowledgement.confirmed_at at time zone 'UTC')::date
    from public.meetup_acknowledgements acknowledgement
    where acknowledgement.confirmed_at is not null
  ), first_activation as (
    select activation_events.user_id, min(activation_events.metric_day) as metric_day
    from activation_events
    group by activation_events.user_id
  ), availability_counts as (
    select (availability.created_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.user_availabilities availability
    where availability.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and availability.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), poke_sent_counts as (
    select (poke.created_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.pokes poke
    where poke.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and poke.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), poke_accepted_counts as (
    select (poke.responded_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.pokes poke
    where poke.status = 'accepted' and poke.responded_at is not null
      and poke.responded_at >= (p_start_day::timestamp at time zone 'UTC')
      and poke.responded_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), plan_created_counts as (
    select (plan.created_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.plans plan
    where plan.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and plan.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), plans_from_pokes_counts as (
    select (plan.created_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.plans plan
    where plan.source_thread_id is not null
      and plan.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and plan.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
      and exists (
        select 1 from public.pokes poke
        where poke.status = 'accepted'
          and poke.thread_id = plan.source_thread_id
          and poke.responded_at <= plan.created_at
      )
    group by 1
  ), plan_join_counts as (
    select (join_attempt.created_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.plan_join_idempotency join_attempt
    where join_attempt.response_body->>'joined' = 'true'
      and join_attempt.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and join_attempt.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), mutual_meetup_counts as (
    select (acknowledgement.confirmed_at at time zone 'UTC')::date as metric_day, count(*)::bigint as count
    from public.meetup_acknowledgements acknowledgement
    where acknowledgement.confirmed_at is not null
      and acknowledgement.confirmed_at >= (p_start_day::timestamp at time zone 'UTC')
      and acknowledgement.confirmed_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    group by 1
  )
  select day.metric_day,
    coalesce((select count(*)::bigint from first_activation activation where activation.metric_day = day.metric_day), 0),
    coalesce(availability_counts.count, 0),
    coalesce(poke_sent_counts.count, 0),
    coalesce(poke_accepted_counts.count, 0),
    coalesce(plan_created_counts.count, 0),
    coalesce(plans_from_pokes_counts.count, 0),
    coalesce(plan_join_counts.count, 0),
    coalesce(mutual_meetup_counts.count, 0)
  from days day
  left join availability_counts on availability_counts.metric_day = day.metric_day
  left join poke_sent_counts on poke_sent_counts.metric_day = day.metric_day
  left join poke_accepted_counts on poke_accepted_counts.metric_day = day.metric_day
  left join plan_created_counts on plan_created_counts.metric_day = day.metric_day
  left join plans_from_pokes_counts on plans_from_pokes_counts.metric_day = day.metric_day
  left join plan_join_counts on plan_join_counts.metric_day = day.metric_day
  left join mutual_meetup_counts on mutual_meetup_counts.metric_day = day.metric_day
  order by day.metric_day;
end;
$$;

revoke all on function public.product_daily_funnel_metrics(date, date) from public, anon, authenticated;
grant execute on function public.product_daily_funnel_metrics(date, date) to service_role;

-- Weekly social activity uses only durable social actions. A person is active
-- when they send or respond to a Poke, create or successfully join a Plan, or
-- complete a mutual acknowledgement. Passive reads are intentionally excluded.
create or replace function public.product_weekly_social_activity_metrics(
  p_start_day date,
  p_end_day date default (pg_catalog.now() at time zone 'UTC')::date
)
returns table(
  week_start date,
  socially_active_accounts bigint,
  repeat_week_socially_active_accounts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start_day is null or p_end_day is null
     or p_start_day > p_end_day
     or p_end_day - p_start_day > 30 then
    raise exception 'metric range must be between one and thirty-one UTC days' using errcode = '22023';
  end if;

  return query
  with social_events as (
    select poke.sender_id as user_id, (poke.created_at at time zone 'UTC')::date as activity_day
    from public.pokes poke
    where poke.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and poke.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    union all
    select poke.recipient_id, (poke.responded_at at time zone 'UTC')::date
    from public.pokes poke
    where poke.responded_at is not null
      and poke.responded_at >= (p_start_day::timestamp at time zone 'UTC')
      and poke.responded_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    union all
    select plan.owner_id, (plan.created_at at time zone 'UTC')::date
    from public.plans plan
    where plan.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and plan.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    union all
    select join_attempt.actor_id, (join_attempt.created_at at time zone 'UTC')::date
    from public.plan_join_idempotency join_attempt
    where join_attempt.response_body->>'joined' = 'true'
      and join_attempt.created_at >= (p_start_day::timestamp at time zone 'UTC')
      and join_attempt.created_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    union all
    select acknowledgement.user_a_id, (acknowledgement.confirmed_at at time zone 'UTC')::date
    from public.meetup_acknowledgements acknowledgement
    where acknowledgement.confirmed_at is not null
      and acknowledgement.confirmed_at >= (p_start_day::timestamp at time zone 'UTC')
      and acknowledgement.confirmed_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
    union all
    select acknowledgement.user_b_id, (acknowledgement.confirmed_at at time zone 'UTC')::date
    from public.meetup_acknowledgements acknowledgement
    where acknowledgement.confirmed_at is not null
      and acknowledgement.confirmed_at >= (p_start_day::timestamp at time zone 'UTC')
      and acknowledgement.confirmed_at < ((p_end_day + 1)::timestamp at time zone 'UTC')
  ), bounded_activity as (
    select distinct event.user_id,
      date_trunc('week', event.activity_day::timestamp)::date as week_start
    from social_events event
    where event.activity_day between p_start_day and p_end_day
  ), weeks as (
    select week::date as week_start
    from pg_catalog.generate_series(
      date_trunc('week', p_start_day::timestamp)::date,
      date_trunc('week', p_end_day::timestamp)::date,
      interval '1 week'
    ) week
  )
  select week.week_start,
    coalesce((select count(*)::bigint from bounded_activity active where active.week_start = week.week_start), 0),
    coalesce((
      select count(*)::bigint
      from bounded_activity active
      where active.week_start = week.week_start
        and exists (
          select 1 from bounded_activity prior
          where prior.user_id = active.user_id
            and prior.week_start < active.week_start
        )
    ), 0)
  from weeks week
  order by week.week_start;
end;
$$;

revoke all on function public.product_weekly_social_activity_metrics(date, date) from public, anon, authenticated;
grant execute on function public.product_weekly_social_activity_metrics(date, date) to service_role;
