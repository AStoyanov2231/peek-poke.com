-- Add accepted Pokes and active shared Plans as bounded, server-authorized
-- meeting contexts. Apply after the social-intent and Plans migrations.
do $$
begin
  if pg_catalog.to_regclass('public.friendships') is null
     or pg_catalog.to_regclass('public.pokes') is null
     or pg_catalog.to_regclass('public.plans') is null
     or pg_catalog.to_regclass('public.plan_members') is null
     or pg_catalog.to_regclass('public.user_blocks') is null
     or pg_catalog.to_regclass('public.user_locations') is null
     or pg_catalog.to_regclass('public.friend_meetings') is null
     or pg_catalog.to_regprocedure('public.record_meeting_for_user(uuid,uuid)') is null then
    raise exception 'meeting, social, and Plans baselines must be applied first';
  end if;
end;
$$;

create index if not exists pokes_accepted_pair_idx
  on public.pokes (sender_id, recipient_id)
  where status = 'accepted';

-- The helper intentionally makes no award decision. It authorizes only a
-- confirmed relationship context. Exact presence, one-row pair idempotency,
-- wallet cap, and ledger writes remain in record_meeting_for_user below.
create or replace function public.meeting_pair_eligible_v1(
  p_actor_id uuid,
  p_peer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and ((friendship.requester_id = p_actor_id and friendship.addressee_id = p_peer_id)
        or (friendship.requester_id = p_peer_id and friendship.addressee_id = p_actor_id))
  )
  or exists (
    select 1
    from public.pokes poke
    where poke.status = 'accepted'
      and ((poke.sender_id = p_actor_id and poke.recipient_id = p_peer_id)
        or (poke.sender_id = p_peer_id and poke.recipient_id = p_actor_id))
  )
  or exists (
    select 1
    from public.plans plan
    join public.plan_members actor_member
      on actor_member.plan_id = plan.id and actor_member.user_id = p_actor_id
    join public.plan_members peer_member
      on peer_member.plan_id = plan.id and peer_member.user_id = p_peer_id
    where plan.status = 'active'
      and plan.starts_at between pg_catalog.now() - interval '6 hours'
        and pg_catalog.now() + interval '24 hours'
  );
$$;

-- This retains the hosted authoritative core verbatim except for relationship
-- eligibility and the explicit bidirectional block gate. In particular, it
-- retains 10-minute server freshness, exact 50m math, ordered wallet locks,
-- canonical pair uniqueness, cap, and conditional ledger entries.
create or replace function public.record_meeting_for_user(
  p_user_id uuid,
  p_friend_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  canonical_a uuid := least(p_user_id, p_friend_id);
  canonical_b uuid := greatest(p_user_id, p_friend_id);
  user_location public.user_locations%rowtype;
  friend_location public.user_locations%rowtype;
  distance_meters double precision;
  inserted_meeting boolean;
  old_balance_user integer;
  old_balance_friend integer;
  balance_user integer;
  balance_friend integer;
  awarded_user boolean;
  awarded_friend boolean;
begin
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id then
    return pg_catalog.jsonb_build_object('error', 'INVALID_USERS', 'message', 'Two different users are required', 'status', 400);
  end if;

  if exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = p_user_id and block.blocked_id = p_friend_id)
       or (block.blocker_id = p_friend_id and block.blocked_id = p_user_id)
  ) or not public.meeting_pair_eligible_v1(p_user_id, p_friend_id) then
    -- Keep the established error code so the existing idempotent wrapper and
    -- transport contract remain stable, without disclosing a block state.
    return pg_catalog.jsonb_build_object('error', 'NOT_FRIENDS', 'message', 'Users do not share a confirmed meetup connection', 'status', 400);
  end if;

  select * into user_location
  from public.user_locations
  where user_id = p_user_id and updated_at > pg_catalog.now() - interval '10 minutes';
  select * into friend_location
  from public.user_locations
  where user_id = p_friend_id and updated_at > pg_catalog.now() - interval '10 minutes';
  if user_location.user_id is null or friend_location.user_id is null then
    return pg_catalog.jsonb_build_object('error', 'LOCATION_STALE', 'message', 'Both users need a recent location', 'status', 409);
  end if;

  distance_meters := 111320 * pg_catalog.sqrt(
    pg_catalog.power(friend_location.lat - user_location.lat, 2)
    + pg_catalog.power(
      (friend_location.lng - user_location.lng) * pg_catalog.cos(pg_catalog.radians(user_location.lat)),
      2
    )
  );
  if distance_meters > 50 then
    return pg_catalog.jsonb_build_object('error', 'TOO_FAR', 'message', 'Users are not within 50 meters', 'status', 409);
  end if;

  perform wallet.user_id
  from public.user_coins wallet
  where wallet.user_id in (p_user_id, p_friend_id)
  order by wallet.user_id
  for update;
  select balance into old_balance_user from public.user_coins where user_id = p_user_id;
  select balance into old_balance_friend from public.user_coins where user_id = p_friend_id;
  if old_balance_user is null or old_balance_friend is null then
    return pg_catalog.jsonb_build_object('error', 'WALLET_NOT_FOUND', 'message', 'Both users need an active wallet', 'status', 409);
  end if;

  begin
    insert into public.friend_meetings (user_a_id, user_b_id)
    values (canonical_a, canonical_b);
    inserted_meeting := true;
  exception when unique_violation then
    inserted_meeting := false;
  end;
  if not inserted_meeting then
    return pg_catalog.jsonb_build_object('success', true, 'already_met', true);
  end if;

  update public.user_coins
  set balance = least(balance + 1, 5), updated_at = pg_catalog.now()
  where user_id = p_user_id
  returning balance into balance_user;
  update public.user_coins
  set balance = least(balance + 1, 5), updated_at = pg_catalog.now()
  where user_id = p_friend_id
  returning balance into balance_friend;
  awarded_user := balance_user > old_balance_user;
  awarded_friend := balance_friend > old_balance_friend;
  if awarded_user then
    insert into public.coin_transactions (user_id, amount, reason, related_user_id)
    values (p_user_id, 1, 'meeting_bonus', p_friend_id);
  end if;
  if awarded_friend then
    insert into public.coin_transactions (user_id, amount, reason, related_user_id)
    values (p_friend_id, 1, 'meeting_bonus', p_user_id);
  end if;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_met', false,
    'awarded', awarded_user,
    'balance_user', balance_user,
    'balance_friend', balance_friend
  );
end;
$$;

revoke all on function public.meeting_pair_eligible_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.meeting_pair_eligible_v1(uuid, uuid) to service_role;
revoke all on function public.record_meeting_for_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_meeting_for_user(uuid, uuid) to service_role;
