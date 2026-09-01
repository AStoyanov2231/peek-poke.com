do $$
begin
  if pg_catalog.to_regclass('public.user_locations') is null
     or pg_catalog.to_regclass('public.admin_coins') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.profile_photos') is null
     or pg_catalog.to_regclass('public.user_blocks') is null then
    raise exception 'The hosted schema baseline must be present before attested location discovery';
  end if;
end;
$$;

alter table public.user_locations
  add column if not exists verification_method text,
  add column if not exists verified_at timestamptz;

create table if not exists public.location_attestation_nonces (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists location_attestation_nonces_expiry_idx
  on public.location_attestation_nonces (expires_at);

alter table public.location_attestation_nonces enable row level security;
drop policy if exists "location attestation nonces are server only"
  on public.location_attestation_nonces;
create policy "location attestation nonces are server only"
  on public.location_attestation_nonces
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.location_attestation_nonces from anon, authenticated;
grant all on public.location_attestation_nonces to service_role;

drop function if exists public.upsert_user_location(uuid, double precision, double precision);

create or replace function public.upsert_user_location(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_nonce_hash text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed integer;
begin
  if p_user_id is null
     or p_lat is null
     or p_lng is null
     or p_lat < -90
     or p_lat > 90
     or p_lng < -180
     or p_lng > 180
     or p_nonce_hash is null
     or p_nonce_hash !~ '^[0-9a-f]{64}$'
     or p_issued_at is null
     or p_issued_at < pg_catalog.now() - interval '2 minutes'
     or p_issued_at > pg_catalog.now() + interval '30 seconds' then
    return pg_catalog.jsonb_build_object('error', 'INVALID_LOCATION_ATTESTATION');
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.deleted_at is null
  ) then
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  insert into public.location_attestation_nonces (
    nonce_hash,
    user_id,
    issued_at,
    expires_at
  )
  values (
    p_nonce_hash,
    p_user_id,
    p_issued_at,
    pg_catalog.now() + interval '2 minutes'
  )
  on conflict (nonce_hash) do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then
    return pg_catalog.jsonb_build_object('error', 'ATTESTATION_REPLAYED');
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
    'attestation',
    pg_catalog.now()
  )
  on conflict (user_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      updated_at = excluded.updated_at,
      verification_method = excluded.verification_method,
      verified_at = excluded.verified_at;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.upsert_user_location(
  uuid, double precision, double precision, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.upsert_user_location(
  uuid, double precision, double precision, text, timestamptz
) to service_role;

create or replace function public.nearby_users_for_user(
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
  lng double precision
)
language sql
security invoker
set search_path = ''
as $$
  with center as (
    select location.lat, location.lng
    from public.user_locations location
    where location.user_id = p_user_id
      and location.verified_at is not null
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
     and candidate.verified_at is not null
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
    candidates.lng
  from candidates
  where candidates.distance_km <= greatest(0.1, least(p_radius_km, 5))
  order by candidates.distance_km, candidates.user_id
  limit 100;
$$;

revoke all on function public.nearby_users_for_user(uuid, double precision)
  from public, anon, authenticated;
grant execute on function public.nearby_users_for_user(uuid, double precision)
  to service_role;

create or replace function public.list_admin_coins_for_user(
  p_user_id uuid,
  p_radius_km double precision default 5
)
returns table(
  id uuid,
  lat double precision,
  lng double precision
)
language sql
security invoker
set search_path = ''
as $$
  with center as (
    select location.lat, location.lng
    from public.user_locations location
    where location.user_id = p_user_id
      and location.verified_at is not null
      and location.updated_at > pg_catalog.now() - interval '10 minutes'
  )
  select coin.id, coin.lat, coin.lng
  from center
  join public.admin_coins coin on 6371 * 2 * asin(sqrt(
    power(sin(radians((coin.lat - center.lat) / 2)), 2)
    + cos(radians(center.lat)) * cos(radians(coin.lat))
    * power(sin(radians((coin.lng - center.lng) / 2)), 2)
  )) <= greatest(0.1, least(p_radius_km, 5))
  order by coin.id
  limit 50;
$$;

revoke all on function public.list_admin_coins_for_user(uuid, double precision)
  from public, anon, authenticated;
grant execute on function public.list_admin_coins_for_user(uuid, double precision)
  to service_role;
