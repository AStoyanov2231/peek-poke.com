-- Viewer-authorized profile context. Each subquery is independently bounded and
-- only returns a target's activity when the viewer is entitled to see it.
do $$
begin
  if pg_catalog.to_regprocedure('public.discovery_subject_visible_to_viewer(uuid,uuid)') is null
     or pg_catalog.to_regprocedure('public.plan_viewable_v1(uuid,public.plans)') is null
     or pg_catalog.to_regprocedure('public.plan_payload_v1(uuid,uuid)') is null then
    raise exception 'discovery and plan visibility baselines must be applied first';
  end if;
end;
$$;

create or replace function public.get_profile_social_context(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_availability jsonb;
  v_shared_circles jsonb;
  v_upcoming_plans jsonb;
  v_mutual_meetups bigint;
begin
  if p_viewer_id is null or p_target_id is null
     or not exists (select 1 from public.profiles profile where profile.id = p_viewer_id and profile.deleted_at is null)
     or not exists (select 1 from public.profiles profile where profile.id = p_target_id and profile.deleted_at is null)
     or exists (
       select 1 from public.user_blocks block
       where (block.blocker_id = p_viewer_id and block.blocked_id = p_target_id)
          or (block.blocker_id = p_target_id and block.blocked_id = p_viewer_id)
     ) then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  select public.social_availability_json(availability) into v_availability
  from public.user_availabilities availability
  where availability.user_id = p_target_id
    and availability.expires_at > pg_catalog.now()
    and public.discovery_subject_visible_to_viewer(p_viewer_id, p_target_id);

  select coalesce(jsonb_agg(circle.payload order by circle.id), '[]'::jsonb) into v_shared_circles
  from (
    select distinct viewer_circle.group_id as id,
      jsonb_build_object('id', viewer_circle.group_id, 'name', 'Shared group') as payload
    from public.shared_group_members viewer_circle
    join public.shared_group_members target_circle on target_circle.group_id = viewer_circle.group_id
    where viewer_circle.user_id = p_viewer_id
      and target_circle.user_id = p_target_id
    order by viewer_circle.group_id
    limit 6
  ) circle;

  select coalesce(jsonb_agg(plan_context.payload order by plan_context.starts_at, plan_context.id), '[]'::jsonb) into v_upcoming_plans
  from (
    select plan.id, plan.starts_at, public.plan_payload_v1(p_viewer_id, plan.id)->'plan' as payload
    from public.plans plan
    where plan.status = 'active'
      and plan.starts_at > pg_catalog.now()
      and exists (
        select 1 from public.plan_members target_member
        where target_member.plan_id = plan.id and target_member.user_id = p_target_id
      )
      and public.plan_viewable_v1(p_viewer_id, plan)
    order by plan.starts_at, plan.id
    limit 3
  ) plan_context;

  select count(*) into v_mutual_meetups
  from public.meetup_acknowledgements acknowledgement
  where acknowledgement.confirmed_at is not null
    and ((acknowledgement.user_a_id = p_viewer_id and acknowledgement.user_b_id = p_target_id)
      or (acknowledgement.user_a_id = p_target_id and acknowledgement.user_b_id = p_viewer_id));

  return jsonb_build_object(
    'availability', v_availability,
    'sharedCircles', v_shared_circles,
    'upcomingPlans', v_upcoming_plans,
    'mutualMeetups', v_mutual_meetups
  );
end;
$$;

revoke all on function public.get_profile_social_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_profile_social_context(uuid, uuid) to service_role;
