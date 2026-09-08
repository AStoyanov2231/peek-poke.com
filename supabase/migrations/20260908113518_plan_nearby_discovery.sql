-- A future meeting's free-text place is not evidence of its geography.
-- Hosts must explicitly opt in to discovery near a fresh current location.
alter table public.plans
  add column if not exists nearby_discoverable boolean not null default false,
  add column if not exists nearby_lat double precision,
  add column if not exists nearby_lng double precision,
  add constraint plans_nearby_coordinates_check check (
    (nearby_discoverable = false and nearby_lat is null and nearby_lng is null)
    or (nearby_discoverable = true and nearby_lat is not null and nearby_lng is not null and nearby_lat between -90 and 90 and nearby_lng between -180 and 180)
  );

create index if not exists plans_nearby_discovery_idx on public.plans (starts_at, nearby_lat, nearby_lng)
  where status = 'active' and visibility = 'open' and nearby_discoverable;

create or replace function public.plan_create_v2(p_actor_id uuid, p_activity text, p_title text, p_starts_at timestamptz, p_place_text text, p_visibility text, p_circle_id uuid, p_participant_limit smallint, p_source_thread_id uuid, p_idempotency_key text, p_request_hash text, p_nearby_discovery boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.plan_create_idempotency; v_location public.user_locations; v_result jsonb; v_plan_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor_id::text || ':plan:create:' || p_idempotency_key));
  select * into v_existing from public.plan_create_idempotency where actor_id=p_actor_id and idempotency_key=p_idempotency_key;
  if found then return public.plan_create_v1(p_actor_id,p_activity,p_title,p_starts_at,p_place_text,p_visibility,p_circle_id,p_participant_limit,p_source_thread_id,p_idempotency_key,p_request_hash); end if;
  if coalesce(p_nearby_discovery,false) then
    select * into v_location from public.user_locations where user_id=p_actor_id and updated_at > pg_catalog.now() - interval '10 minutes';
    if not found then return jsonb_build_object('error','LOCATION_REQUIRED'); end if;
  end if;
  v_result := public.plan_create_v1(p_actor_id,p_activity,p_title,p_starts_at,p_place_text,p_visibility,p_circle_id,p_participant_limit,p_source_thread_id,p_idempotency_key,p_request_hash);
  if v_result ? 'error' or not coalesce(p_nearby_discovery,false) then return v_result; end if;
  v_plan_id := (v_result->'plan'->>'id')::uuid;
  update public.plans set nearby_discoverable=true, nearby_lat=round(v_location.lat::numeric,2)::double precision, nearby_lng=round(v_location.lng::numeric,2)::double precision where id=v_plan_id;
  return v_result;
end $$;

create or replace function public.plans_list_v2(p_actor_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with viewer as (select lat,lng from public.user_locations where user_id=p_actor_id and updated_at > pg_catalog.now()-interval '10 minutes')
  select jsonb_build_object('plans',coalesce(jsonb_agg(payload.plan order by payload.plan->>'starts_at',payload.plan->>'id'),'[]'::jsonb))
  from (select public.plan_payload_v1(p_actor_id,p.id)->'plan' plan from public.plans p
    where p.status='active' and p.starts_at>pg_catalog.now() and public.plan_viewable_v1(p_actor_id,p)
      and (p.visibility <> 'open' or p.owner_id=p_actor_id or exists(select 1 from public.plan_members m where m.plan_id=p.id and m.user_id=p_actor_id) or (p.nearby_discoverable and exists(select 1 from viewer v where 6371*2*asin(sqrt(power(sin(radians((p.nearby_lat-v.lat)/2)),2)+cos(radians(v.lat))*cos(radians(p.nearby_lat))*power(sin(radians((p.nearby_lng-v.lng)/2)),2))) <= 5)))
    order by p.starts_at,p.id limit 100) payload;
$$;
revoke all on function public.plan_create_v2(uuid,text,text,timestamptz,text,text,uuid,smallint,uuid,text,text,boolean), public.plans_list_v2(uuid) from public,anon,authenticated;
grant execute on function public.plan_create_v2(uuid,text,text,timestamptz,text,text,uuid,smallint,uuid,text,text,boolean), public.plans_list_v2(uuid) to service_role;
