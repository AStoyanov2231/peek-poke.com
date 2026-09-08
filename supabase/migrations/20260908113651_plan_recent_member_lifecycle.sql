-- Keep a short member-only post-start window for explicit Plan confirmations.
-- The list reserves 20 slots for recent member Plans and 80 for future Plans.
create or replace function public.plans_list_v2(p_actor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select location.lat, location.lng
    from public.user_locations location
    where location.user_id = p_actor_id
      and location.updated_at > pg_catalog.now() - interval '10 minutes'
  ), recent_member_plans as (
    select plan.id, plan.starts_at, true as recent
    from public.plans plan
    join public.plan_members member
      on member.plan_id = plan.id and member.user_id = p_actor_id
    where plan.status = 'active'
      and plan.starts_at <= pg_catalog.now()
      and plan.starts_at > pg_catalog.now() - interval '48 hours'
      and not public.plan_has_blocked_member_v1(p_actor_id, plan.id)
    order by plan.starts_at desc, plan.id
    limit 20
  ), future_plans as (
    select plan.id, plan.starts_at, false as recent
    from public.plans plan
    where plan.status = 'active'
      and plan.starts_at > pg_catalog.now()
      and public.plan_viewable_v1(p_actor_id, plan)
      and (
        plan.visibility <> 'open'
        or plan.owner_id = p_actor_id
        or exists (
          select 1 from public.plan_members member
          where member.plan_id = plan.id and member.user_id = p_actor_id
        )
        or (
          plan.nearby_discoverable
          and exists (
            select 1 from viewer
            where 6371 * 2 * asin(sqrt(
              power(sin(radians((plan.nearby_lat - viewer.lat) / 2)), 2)
              + cos(radians(viewer.lat)) * cos(radians(plan.nearby_lat))
              * power(sin(radians((plan.nearby_lng - viewer.lng) / 2)), 2)
            )) <= 5
          )
        )
      )
    order by plan.starts_at, plan.id
    limit 80
  ), candidates as (
    select * from recent_member_plans
    union all
    select * from future_plans
  )
  select pg_catalog.jsonb_build_object(
    'plans',
    coalesce(
      jsonb_agg(
        public.plan_payload_v1(p_actor_id, candidate.id)->'plan'
        order by candidate.recent desc, candidate.starts_at, candidate.id
      ),
      '[]'::jsonb
    )
  )
  from candidates candidate;
$$;

-- A started Plan is a historical coordination record. Its time and all other
-- host-editable fields remain immutable once confirmation can open.
create or replace function public.plan_update_v1(p_actor_id uuid, p_plan_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_visibility text;
  v_circle_id uuid;
  v_limit smallint;
  v_starts timestamptz;
begin
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return pg_catalog.jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_plan.owner_id <> p_actor_id then return pg_catalog.jsonb_build_object('error', 'FORBIDDEN'); end if;
  if v_plan.status <> 'active' then return pg_catalog.jsonb_build_object('error', 'CANCELLED'); end if;
  if v_plan.starts_at <= pg_catalog.now() then return pg_catalog.jsonb_build_object('error', 'EXPIRED'); end if;

  v_visibility := coalesce(p_patch->>'visibility', v_plan.visibility);
  v_circle_id := case when p_patch ? 'circle_id' then nullif(p_patch->>'circle_id', '')::uuid else v_plan.circle_id end;
  v_limit := coalesce((p_patch->>'participant_limit')::smallint, v_plan.participant_limit);
  v_starts := coalesce((p_patch->>'starts_at')::timestamptz, v_plan.starts_at);
  if v_starts <= pg_catalog.now()
     or v_limit < (select count(*) from public.plan_members where plan_id = p_plan_id)
     or ((v_visibility = 'circle') <> (v_circle_id is not null))
     or (p_patch ? 'activity' and char_length(btrim(p_patch->>'activity')) not between 1 and 48)
     or (p_patch ? 'title' and p_patch->>'title' is not null and char_length(btrim(p_patch->>'title')) not between 1 and 96)
     or (p_patch ? 'place_text' and char_length(btrim(p_patch->>'place_text')) not between 1 and 160) then
    return pg_catalog.jsonb_build_object('error', 'INVALID');
  end if;
  if v_visibility = 'circle'
     and not exists (
       select 1 from public.shared_group_members
       where group_id = v_circle_id and user_id = p_actor_id
     ) then
    return pg_catalog.jsonb_build_object('error', 'FORBIDDEN');
  end if;

  update public.plans
  set activity = case when p_patch ? 'activity' then btrim(p_patch->>'activity') else activity end,
      title = case when p_patch ? 'title' then nullif(btrim(p_patch->>'title'), '') else title end,
      starts_at = v_starts,
      place_text = case when p_patch ? 'place_text' then btrim(p_patch->>'place_text') else place_text end,
      visibility = v_visibility,
      circle_id = v_circle_id,
      participant_limit = v_limit,
      updated_at = pg_catalog.now()
  where id = p_plan_id;
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

revoke all on function public.plans_list_v2(uuid), public.plan_update_v1(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plans_list_v2(uuid), public.plan_update_v1(uuid, uuid, jsonb) to service_role;
