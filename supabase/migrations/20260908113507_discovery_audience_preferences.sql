-- Discovery defaults to the existing public audience until a person explicitly
-- chooses a narrower scope. Preferences are separate from profiles so the
-- hosted profile schema remains untouched.
create type public.discovery_audience as enum (
  'hidden',
  'friends',
  'friends_of_friends',
  'circles',
  'everyone'
);

create table public.discovery_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  audience public.discovery_audience not null default 'everyone',
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.discovery_preferences enable row level security;
create policy "discovery preferences are server only"
  on public.discovery_preferences for all to authenticated
  using (false) with check (false);
revoke all on public.discovery_preferences from public, anon, authenticated;
grant all on public.discovery_preferences to service_role;

create or replace function public.discovery_subject_visible_to_viewer(
  p_viewer_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer_id is not null
    and p_subject_id is not null
    and p_viewer_id <> p_subject_id
    and exists (select 1 from public.profiles viewer where viewer.id = p_viewer_id and viewer.deleted_at is null)
    and exists (select 1 from public.profiles subject where subject.id = p_subject_id and subject.deleted_at is null)
    and not exists (
      select 1 from public.user_blocks block
      where (block.blocker_id = p_viewer_id and block.blocked_id = p_subject_id)
         or (block.blocker_id = p_subject_id and block.blocked_id = p_viewer_id)
    )
    and case coalesce((
      select preference.audience
      from public.discovery_preferences preference
      where preference.user_id = p_subject_id
    ), 'everyone'::public.discovery_audience)
      when 'hidden'::public.discovery_audience then false
      when 'everyone'::public.discovery_audience then true
      when 'friends'::public.discovery_audience then exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = p_viewer_id and friendship.addressee_id = p_subject_id)
            or (friendship.addressee_id = p_viewer_id and friendship.requester_id = p_subject_id))
      )
      when 'friends_of_friends'::public.discovery_audience then exists (
        select 1 from public.friendships direct_friendship
        where direct_friendship.status = 'accepted'
          and ((direct_friendship.requester_id = p_viewer_id and direct_friendship.addressee_id = p_subject_id)
            or (direct_friendship.addressee_id = p_viewer_id and direct_friendship.requester_id = p_subject_id))
      ) or exists (
        select 1
        from public.profiles mutual
        where mutual.deleted_at is null
          and mutual.id <> p_viewer_id
          and mutual.id <> p_subject_id
          and exists (
            select 1 from public.friendships viewer_friendship
            where viewer_friendship.status = 'accepted'
              and ((viewer_friendship.requester_id = p_viewer_id and viewer_friendship.addressee_id = mutual.id)
                or (viewer_friendship.addressee_id = p_viewer_id and viewer_friendship.requester_id = mutual.id))
          )
          and exists (
            select 1 from public.friendships subject_friendship
            where subject_friendship.status = 'accepted'
              and ((subject_friendship.requester_id = p_subject_id and subject_friendship.addressee_id = mutual.id)
                or (subject_friendship.addressee_id = p_subject_id and subject_friendship.requester_id = mutual.id))
          )
      )
      when 'circles'::public.discovery_audience then exists (
        select 1
        from public.shared_group_members viewer_circle
        join public.shared_group_members subject_circle on subject_circle.group_id = viewer_circle.group_id
        where viewer_circle.user_id = p_viewer_id
          and subject_circle.user_id = p_subject_id
      )
    end;
$$;

create or replace function public.read_discovery_preference(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'audience', coalesce((
      select preference.audience::text
      from public.discovery_preferences preference
      where preference.user_id = p_user_id
    ), 'everyone')
  )
  where exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id and profile.deleted_at is null
  );
$$;

create or replace function public.update_discovery_preference(
  p_user_id uuid,
  p_audience public.discovery_audience
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audience public.discovery_audience;
begin
  if p_user_id is null or p_audience is null
     or not exists (select 1 from public.profiles profile where profile.id = p_user_id and profile.deleted_at is null) then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;
  insert into public.discovery_preferences (user_id, audience)
  values (p_user_id, p_audience)
  on conflict (user_id) do update
  set audience = excluded.audience, updated_at = pg_catalog.now()
  returning audience into v_audience;
  return pg_catalog.jsonb_build_object('audience', v_audience::text);
end;
$$;

-- Existing nearby discovery must apply the same audience predicate as Now.
create or replace function public.nearby_users_for_user(
  p_user_id uuid,
  p_radius_km double precision default 2
)
returns table(user_id uuid, username text, display_name text, avatar_url text, is_online boolean, last_seen_at timestamptz, lat double precision, lng double precision)
language sql
security invoker
set search_path = ''
as $$
  with center as (
    select location.lat, location.lng from public.user_locations location
    where location.user_id = p_user_id and location.updated_at > now() - interval '10 minutes'
  ), candidates as (
    select candidate.user_id, profile.username, profile.display_name, avatar.url as avatar_url, profile.is_online, profile.last_seen_at,
      round(candidate.lat::numeric, 2)::double precision as lat,
      round(candidate.lng::numeric, 2)::double precision as lng,
      6371 * 2 * asin(sqrt(power(sin(radians((candidate.lat - center.lat) / 2)), 2) + cos(radians(center.lat)) * cos(radians(candidate.lat)) * power(sin(radians((candidate.lng - center.lng) / 2)), 2))) as distance_km
    from center join public.user_locations candidate on candidate.user_id <> p_user_id and candidate.updated_at > now() - interval '10 minutes'
    join public.profiles profile on profile.id = candidate.user_id and profile.deleted_at is null and profile.onboarding_completed = true
    left join lateral (select photo.url from public.profile_photos photo where photo.user_id = candidate.user_id and photo.is_avatar = true and photo.is_private = false and photo.approval_status = 'approved' order by photo.display_order, photo.id limit 1) avatar on true
    where public.discovery_subject_visible_to_viewer(p_user_id, candidate.user_id)
  )
  select user_id, username, display_name, avatar_url, is_online, last_seen_at, lat, lng from candidates
  where distance_km <= greatest(0.1, least(p_radius_km, 5)) order by distance_km, user_id limit 100;
$$;

-- The product-social availability function is defined in the preceding
-- migration. Recreate only its selection contract to keep audience filtering
-- and location freshness identical to nearby discovery.
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
      join public.user_locations vl on vl.user_id = p_viewer_id and vl.updated_at > now() - interval '10 minutes'
      join public.user_locations other on other.user_id = a.user_id and other.updated_at > now() - interval '10 minutes'
      left join public.friendships f on f.status = 'accepted' and ((f.requester_id = p_viewer_id and f.addressee_id = p.id) or (f.addressee_id = p_viewer_id and f.requester_id = p.id))
      left join lateral (select jsonb_agg(t.name order by t.name) as names from public.profile_interests mine join public.profile_interests theirs on theirs.tag_id = mine.tag_id and theirs.user_id = p.id join public.interest_tags t on t.id = mine.tag_id where mine.user_id = p_viewer_id) shared on true
      where a.user_id <> p_viewer_id and a.expires_at > now()
        and public.discovery_subject_visible_to_viewer(p_viewer_id, p.id)
    ) candidate
    where candidate.snapped_distance_km <= p_radius_km
    order by candidate.intent_match desc, candidate.is_friend desc, candidate.shared_interest_count desc, candidate.snapped_distance_km, candidate.expires_at limit p_limit
  ) row;
  return jsonb_build_object('availability', case when v_self.id is null then null else public.social_availability_json(v_self) end, 'people', v_people);
end $$;

revoke all on function public.discovery_subject_visible_to_viewer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discovery_subject_visible_to_viewer(uuid, uuid) to service_role;
revoke all on function public.read_discovery_preference(uuid) from public, anon, authenticated;
grant execute on function public.read_discovery_preference(uuid) to service_role;
revoke all on function public.update_discovery_preference(uuid, public.discovery_audience) from public, anon, authenticated;
grant execute on function public.update_discovery_preference(uuid, public.discovery_audience) to service_role;
revoke all on function public.nearby_users_for_user(uuid, double precision) from public, anon, authenticated;
grant execute on function public.nearby_users_for_user(uuid, double precision) to service_role;
revoke all on function public.get_available_people(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_available_people(uuid, integer, integer) to service_role;
