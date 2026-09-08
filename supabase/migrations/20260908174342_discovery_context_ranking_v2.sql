-- Versioned discovery context keeps the deployed get_available_people contract
-- stable while opt-in clients receive compact, non-identifying rank reasons.
-- No graph, message, Plan, or precise-location data is returned.
create or replace function public.get_available_people_v2(
  p_viewer_id uuid,
  p_limit integer default 20,
  p_radius_km integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self public.user_availabilities;
  v_people jsonb;
begin
  perform public.require_adult_social_admission_v1(p_viewer_id);
  if p_limit is null or p_radius_km is null
    or p_limit not between 1 and 100
    or p_radius_km not between 2 and 25 then
    raise exception 'invalid discovery bounds' using errcode = '22023';
  end if;

  select * into v_self
  from public.user_availabilities
  where user_id = p_viewer_id and expires_at > now();

  select coalesce(jsonb_agg(row.payload order by row.intent_match desc, row.is_friend desc, row.has_mutual_meetup desc, row.has_prior_accepted_poke desc, row.mutual_friend_count desc, row.shared_interest_count desc, row.is_recent_activity desc, row.distance_km, row.expires_at, row.profile_id), '[]'::jsonb)
  into v_people
  from (
    select candidate.*,
      greatest(2, ceil(candidate.snapped_distance_km / 2.0) * 2)::float8 as distance_km,
      jsonb_build_object(
        'profile', jsonb_build_object(
          'id', candidate.profile_id,
          'username', candidate.username,
          'display_name', candidate.display_name,
          'avatar_url', candidate.avatar_url,
          'location_text', candidate.location_text,
          'is_online', candidate.is_online,
          'last_seen_at', candidate.last_seen_at
        ),
        'availability', public.social_availability_json(candidate.availability_row),
        'distanceKm', greatest(2, ceil(candidate.snapped_distance_km / 2.0) * 2)::float8,
        'relationship', case when candidate.is_friend then 'friend' else 'none' end,
        'sharedInterestNames', candidate.shared_interest_names,
        'discoveryReasons', (
          select coalesce(jsonb_agg(reason.value order by reason.ordinal), '[]'::jsonb)
          from (
            select reason.value, reason.ordinal
            from unnest(array[
              case when candidate.intent_match = 1 then 'intent_match' end,
              case when candidate.has_mutual_meetup then 'mutual_meetup' end,
              case when candidate.has_prior_accepted_poke then 'connected_before' end,
              case when candidate.mutual_friend_count > 0 then 'mutual_friends' end,
              case when candidate.is_friend then 'nearby_friend' end,
              case when candidate.shared_interest_count > 0 then 'shared_interests' end
            ]::text[]) with ordinality as reason(value, ordinal)
            where reason.value is not null
            order by reason.ordinal
            limit 3
          ) reason
        )
      ) as payload
    from (
      select
        a as availability_row,
        a.expires_at,
        a.updated_at >= now() - interval '15 minutes' as is_recent_activity,
        p.id as profile_id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.location_text,
        p.is_online,
        p.last_seen_at,
        friendship.requester_id is not null as is_friend,
        case when v_self.activity = 'anything' or a.activity = 'anything' or v_self.activity = a.activity then 1 else 0 end as intent_match,
        coalesce(shared.names, '[]'::jsonb) as shared_interest_names,
        coalesce(jsonb_array_length(shared.names), 0) as shared_interest_count,
        coalesce(mutual.mutual_friend_count, 0) as mutual_friend_count,
        coalesce(interaction.has_prior_accepted_poke, false) as has_prior_accepted_poke,
        coalesce(meetup.has_mutual_meetup, false) as has_mutual_meetup,
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(round(viewer_location.lat::numeric, 2)))
              * cos(radians(round(candidate_location.lat::numeric, 2)))
              * cos(radians(round(candidate_location.lng::numeric, 2)) - radians(round(viewer_location.lng::numeric, 2)))
            + sin(radians(round(viewer_location.lat::numeric, 2)))
              * sin(radians(round(candidate_location.lat::numeric, 2)))
          ))
        ) as snapped_distance_km
      from public.user_availabilities a
      join public.profiles p on p.id = a.user_id and p.deleted_at is null
      join public.user_locations viewer_location on viewer_location.user_id = p_viewer_id and viewer_location.updated_at > now() - interval '10 minutes'
      join public.user_locations candidate_location on candidate_location.user_id = a.user_id and candidate_location.updated_at > now() - interval '10 minutes'
      left join public.friendships friendship on friendship.status = 'accepted'
        and ((friendship.requester_id = p_viewer_id and friendship.addressee_id = p.id)
          or (friendship.addressee_id = p_viewer_id and friendship.requester_id = p.id))
      left join lateral (
        select jsonb_agg(tag.name order by tag.name) as names
        from public.profile_interests mine
        join public.profile_interests theirs on theirs.tag_id = mine.tag_id and theirs.user_id = p.id
        join public.interest_tags tag on tag.id = mine.tag_id
        where mine.user_id = p_viewer_id
      ) shared on true
      left join lateral (
        select count(*)::integer as mutual_friend_count
        from (
          select mutual.id
          from public.friendships viewer_friendship
          join public.profiles mutual on mutual.id = case
            when viewer_friendship.requester_id = p_viewer_id then viewer_friendship.addressee_id
            else viewer_friendship.requester_id
          end and mutual.deleted_at is null
          join public.friendships candidate_friendship on candidate_friendship.status = 'accepted'
            and ((candidate_friendship.requester_id = p.id and candidate_friendship.addressee_id = mutual.id)
              or (candidate_friendship.addressee_id = p.id and candidate_friendship.requester_id = mutual.id))
          where viewer_friendship.status = 'accepted'
            and (viewer_friendship.requester_id = p_viewer_id or viewer_friendship.addressee_id = p_viewer_id)
            and public.discovery_subject_visible_to_viewer(p_viewer_id, mutual.id)
            and public.discovery_subject_visible_to_viewer(p.id, mutual.id)
          group by mutual.id
          order by mutual.id
          limit 3
        ) bounded_mutuals
      ) mutual on true
      left join lateral (
        select exists (
          select 1
          from public.pokes prior_poke
          where prior_poke.status = 'accepted'
            and ((prior_poke.sender_id = p_viewer_id and prior_poke.recipient_id = p.id)
              or (prior_poke.sender_id = p.id and prior_poke.recipient_id = p_viewer_id))
        ) as has_prior_accepted_poke
      ) interaction on true
      left join lateral (
        select exists (
          select 1
          from public.meetup_acknowledgements acknowledgement
          where acknowledgement.confirmed_at is not null
            and ((acknowledgement.user_a_id = p_viewer_id and acknowledgement.user_b_id = p.id)
              or (acknowledgement.user_a_id = p.id and acknowledgement.user_b_id = p_viewer_id))
        ) as has_mutual_meetup
      ) meetup on true
      where a.user_id <> p_viewer_id
        and a.expires_at > now()
        and public.discovery_subject_visible_to_viewer(p_viewer_id, p.id)
    ) candidate
    where candidate.snapped_distance_km <= p_radius_km
    order by candidate.intent_match desc, candidate.is_friend desc, candidate.has_mutual_meetup desc, candidate.has_prior_accepted_poke desc, candidate.mutual_friend_count desc, candidate.shared_interest_count desc, candidate.is_recent_activity desc, greatest(2, ceil(candidate.snapped_distance_km / 2.0) * 2)::float8, candidate.expires_at, candidate.profile_id
    limit p_limit
  ) row;

  return jsonb_build_object(
    'availability', case when v_self.id is null then null else public.social_availability_json(v_self) end,
    'people', v_people
  );
end;
$$;

revoke all on function public.get_available_people_v2(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_available_people_v2(uuid, integer, integer)
  to service_role;
