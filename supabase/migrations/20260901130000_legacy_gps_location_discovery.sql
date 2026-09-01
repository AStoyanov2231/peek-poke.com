drop table if exists public.location_attestation_nonces;

update public.user_locations
set verification_method = 'legacy_gps',
    verified_at = null;

drop function if exists public.upsert_user_location(
  uuid, double precision, double precision, text, timestamptz
);

create or replace function public.upsert_user_location(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null
     or p_lat is null
     or p_lng is null
     or p_lat < -90
     or p_lat > 90
     or p_lng < -180
     or p_lng > 180 then
    return pg_catalog.jsonb_build_object('error', 'INVALID_LOCATION');
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.deleted_at is null
  ) then
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  insert into public.user_locations (
    user_id,
    lat,
    lng,
    updated_at,
    verification_method,
    verified_at
  )
  values (
    p_user_id,
    p_lat,
    p_lng,
    pg_catalog.now(),
    'legacy_gps',
    null
  )
  on conflict (user_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      updated_at = excluded.updated_at,
      verification_method = excluded.verification_method,
      verified_at = null;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.upsert_user_location(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.upsert_user_location(uuid, double precision, double precision)
  to service_role;

drop function if exists public.nearby_users_for_user(uuid, double precision);

create function public.nearby_users_for_user(
  p_user_id uuid,
  p_radius_km double precision default 2
)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_online boolean,
  last_seen_at timestamptz,
  lat double precision,
  lng double precision,
  meeting_eligible boolean
)
language sql
security invoker
set search_path = ''
as $$
  with center as (
    select location.lat, location.lng
    from public.user_locations location
    where location.user_id = p_user_id
      and location.updated_at > pg_catalog.now() - interval '10 minutes'
  ), candidates as (
    select
      candidate.user_id,
      profile.username,
      profile.display_name,
      avatar.url as avatar_url,
      profile.is_online,
      profile.last_seen_at,
      round(candidate.lat::numeric, 3)::double precision as lat,
      round(candidate.lng::numeric, 3)::double precision as lng,
      6371 * 2 * asin(sqrt(
        power(sin(radians((candidate.lat - center.lat) / 2)), 2)
        + cos(radians(center.lat)) * cos(radians(candidate.lat))
        * power(sin(radians((candidate.lng - center.lng) / 2)), 2)
      )) as distance_km
    from center
    join public.user_locations candidate
      on candidate.user_id <> p_user_id
     and candidate.updated_at > pg_catalog.now() - interval '10 minutes'
    join public.profiles profile
      on profile.id = candidate.user_id
     and profile.deleted_at is null
     and profile.onboarding_completed = true
    left join lateral (
      select photo.url
      from public.profile_photos photo
      where photo.user_id = candidate.user_id
        and photo.is_avatar = true
        and photo.is_private = false
        and photo.approval_status = 'approved'
      order by photo.display_order, photo.id
      limit 1
    ) avatar on true
    where not exists (
      select 1
      from public.user_blocks block
      where (block.blocker_id = p_user_id and block.blocked_id = candidate.user_id)
         or (block.blocker_id = candidate.user_id and block.blocked_id = p_user_id)
    )
  )
  select
    candidates.user_id,
    candidates.username,
    candidates.display_name,
    candidates.avatar_url,
    candidates.is_online,
    candidates.last_seen_at,
    candidates.lat,
    candidates.lng,
    false as meeting_eligible
  from candidates
  where candidates.distance_km <= greatest(0.1, least(p_radius_km, 5))
  order by candidates.distance_km, candidates.user_id
  limit 100;
$$;

revoke all on function public.nearby_users_for_user(uuid, double precision)
  from public, anon, authenticated;
grant execute on function public.nearby_users_for_user(uuid, double precision)
  to service_role;
