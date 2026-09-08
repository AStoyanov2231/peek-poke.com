-- Core social actions must remain free. This migration keeps the durable
-- idempotency, pair locks, block checks, outbox fanout, and rate-limit bucket
-- from the prior RPCs, while removing wallet mutations and subscription limits.
-- Apply only after importing the hosted baseline that owns these tables.

do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.friendships') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.friendship_mutation_rate_limits') is null then
    raise exception 'The durable friendship baseline must be applied first';
  end if;
end;
$$;

-- Requests made after this migration carry an explicit zero-cost marker. A
-- missing marker identifies a pending request created by the legacy debit RPC,
-- whose escrow must still be returned exactly once when it is removed.
create table if not exists public.friendship_request_charges (
  friendship_id uuid primary key references public.friendships(id) on delete cascade,
  amount integer not null check (amount = 0),
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.friendship_request_charges enable row level security;
drop policy if exists "friendship request charges are server only" on public.friendship_request_charges;
create policy "friendship request charges are server only"
  on public.friendship_request_charges
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.friendship_request_charges from public, anon, authenticated;
grant all on public.friendship_request_charges to service_role;

create or replace function public.send_friend_request_idempotent(
  p_actor_id uuid,
  p_addressee_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.idempotency_records%rowtype;
  v_friendship public.friendships%rowtype;
  v_status integer;
  v_body jsonb;
  v_error_code text;
  v_error_message text;
  v_balance integer := 0;
  v_safe_request_id text := case when p_request_id ~ '^[A-Za-z0-9._:-]{1,128}$' then p_request_id else null end;
begin
  if p_operation is distinct from 'friend_request:create'
     or p_actor_id is null
     or p_addressee_id is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('response_status', 400, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Invalid idempotency request', 'message', 'Invalid idempotency request', 'code', 'INVALID_IDEMPOTENCY_KEY', 'request_id', null), 'retry_after_seconds', null, 'replayed', false);
  end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;

  select * into v_stored
  from public.idempotency_records
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key
  for update;

  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('response_status', 409, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Idempotency key was already used for a different request', 'message', 'Idempotency key was already used for a different request', 'code', 'IDEMPOTENCY_KEY_REUSED', 'request_id', v_safe_request_id), 'retry_after_seconds', null, 'replayed', false);
  end if;
  if v_stored.response_status is not null and v_stored.response_body is not null then
    return pg_catalog.jsonb_build_object('response_status', v_stored.response_status, 'response_body', v_stored.response_body, 'retry_after_seconds', v_stored.response_retry_after_seconds, 'replayed', true);
  end if;

  -- Preserve the bounded anti-spam budget. The count is deliberately unrelated
  -- to a user's coin wallet or subscription.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friendship-rate:' || p_actor_id::text || ':' || p_operation, 0));
  insert into public.friendship_mutation_rate_limits (actor_id, operation, window_started_at, request_count, updated_at)
  values (p_actor_id, p_operation, pg_catalog.clock_timestamp(), 0, pg_catalog.clock_timestamp())
  on conflict (actor_id, operation) do nothing;
  update public.friendship_mutation_rate_limits
  set window_started_at = case when window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() then pg_catalog.clock_timestamp() else window_started_at end,
      request_count = case when window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() then 1 else request_count + 1 end,
      updated_at = pg_catalog.clock_timestamp()
  where actor_id = p_actor_id and operation = p_operation
    and (window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() or request_count < 20);
  if not found then
    v_status := 429;
    v_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Too many requests', 'message', 'Too many requests', 'code', 'RATE_LIMITED', 'request_id', null);
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(case when p_actor_id::text < p_addressee_id::text then p_actor_id::text || ':' || p_addressee_id::text else p_addressee_id::text || ':' || p_actor_id::text end, 0));
    if p_actor_id = p_addressee_id then
      v_status := 400; v_error_code := 'SELF_REQUEST'; v_error_message := 'Cannot add yourself';
    elsif not exists (select 1 from public.profiles where id = p_addressee_id and deleted_at is null) then
      v_status := 404; v_error_code := 'USER_NOT_FOUND'; v_error_message := 'User not found';
    elsif exists (select 1 from public.user_blocks where (blocker_id = p_actor_id and blocked_id = p_addressee_id) or (blocker_id = p_addressee_id and blocked_id = p_actor_id)) then
      v_status := 403; v_error_code := 'BLOCKED'; v_error_message := 'Cannot send request';
    elsif exists (select 1 from public.friendships where (requester_id = p_actor_id and addressee_id = p_addressee_id) or (requester_id = p_addressee_id and addressee_id = p_actor_id)) then
      v_status := 409; v_error_code := 'ALREADY_PENDING'; v_error_message := 'Friendship already exists';
    else
      insert into public.friendships (requester_id, addressee_id, status, requested_at)
      values (p_actor_id, p_addressee_id, 'pending', pg_catalog.now())
      returning * into v_friendship;
      insert into public.friendship_request_charges (friendship_id, amount)
      values (v_friendship.id, 0);
      select balance into v_balance from public.user_coins where user_id = p_actor_id;
      v_body := pg_catalog.jsonb_build_object('friendship', pg_catalog.jsonb_build_object('id', v_friendship.id, 'requester_id', v_friendship.requester_id, 'addressee_id', v_friendship.addressee_id, 'status', v_friendship.status, 'requested_at', v_friendship.requested_at, 'responded_at', v_friendship.responded_at), 'balance', coalesce(v_balance, 0));
      v_status := 200;
    end if;
    if v_status <> 200 and v_body is null then
      v_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', v_error_message, 'message', v_error_message, 'code', v_error_code, 'request_id', v_safe_request_id);
    end if;
  end if;

  update public.idempotency_records set response_status = v_status, response_body = v_body, response_retry_after_seconds = case when v_status = 429 then 60 else null end
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key;
  if v_status = 200 then
    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('friendship.requested', 'friendship', v_friendship.id::text, pg_catalog.jsonb_build_object('friendship_id', v_friendship.id, 'requester_id', p_actor_id, 'addressee_id', p_addressee_id, 'action', 'requested'))
    on conflict (event_type, aggregate_id) where event_type = 'friendship.requested' do nothing;
  end if;
  return pg_catalog.jsonb_build_object('response_status', v_status, 'response_body', v_body, 'retry_after_seconds', case when v_status = 429 then 60 else null end, 'replayed', false);
end;
$$;

-- Pending requests created after this migration cost nothing. A legacy pending
-- request has no zero-cost marker and retains its original one-time refund.
create or replace function public.friendship_removal_core(
  p_friendship_id uuid,
  p_actor_id uuid,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_friendship public.friendships%rowtype;
  v_requester_id uuid;
  v_addressee_id uuid;
  v_charge_amount integer;
  v_refund_claimed integer := 0;
  v_coin_transaction_id uuid;
  v_balance integer;
  v_refund_applied boolean := false;
  v_refunded boolean := false;
begin
  if p_source not in ('delete', 'block') then raise exception 'invalid friendship removal source'; end if;
  select requester_id, addressee_id into v_requester_id, v_addressee_id
  from public.friendships where id = p_friendship_id;
  if v_requester_id is null or v_addressee_id is null then
    return pg_catalog.jsonb_build_object('found', false, 'success', false, 'refunded', false, 'balance', null);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(case when v_requester_id::text < v_addressee_id::text then v_requester_id::text || ':' || v_addressee_id::text else v_addressee_id::text || ':' || v_requester_id::text end, 0));
  select * into v_friendship from public.friendships where id = p_friendship_id for update;
  if v_friendship.id is null or p_actor_id not in (v_friendship.requester_id, v_friendship.addressee_id) then
    return pg_catalog.jsonb_build_object('found', false, 'success', false, 'refunded', false, 'balance', null);
  end if;

  if v_friendship.status = 'pending' then
    select request_charge.amount into v_charge_amount
    from public.friendship_request_charges request_charge
    where request_charge.friendship_id = v_friendship.id;

    -- Legacy requests predate the zero-cost marker and were charged one coin.
    -- Keep the established claim, wallet lock, cap, and immutable ledger entry.
    if v_charge_amount is null then
      v_refund_applied := true;
      insert into public.friendship_refunds (friendship_id, requester_id, addressee_id, source)
      values (v_friendship.id, v_friendship.requester_id, v_friendship.addressee_id, p_source)
      on conflict (friendship_id) do nothing;
      get diagnostics v_refund_claimed = row_count;

      insert into public.user_coins (user_id, balance)
      values (v_friendship.requester_id, 5)
      on conflict (user_id) do nothing;
      select wallet.balance into v_balance
      from public.user_coins wallet
      where wallet.user_id = v_friendship.requester_id
      for update;
      if v_balance is null then
        raise exception 'requester wallet is unavailable';
      end if;
      if v_refund_claimed = 1 then
        update public.user_coins wallet
        set balance = least(wallet.balance + 1, 5), updated_at = pg_catalog.now()
        where wallet.user_id = v_friendship.requester_id
        returning wallet.balance into v_balance;
        insert into public.coin_transactions (user_id, amount, reason, related_user_id)
        values (v_friendship.requester_id, 1, 'request_cancelled_refund', v_friendship.addressee_id)
        returning id into v_coin_transaction_id;
        update public.friendship_refunds refund
        set coin_transaction_id = v_coin_transaction_id
        where refund.friendship_id = v_friendship.id;
      end if;
      v_refunded := p_actor_id = v_friendship.requester_id;
    end if;
  end if;
  delete from public.friendships where id = v_friendship.id;
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values ('friendship.removed', 'friendship', v_friendship.id::text, pg_catalog.jsonb_build_object('friendship_id', v_friendship.id, 'requester_id', v_friendship.requester_id, 'addressee_id', v_friendship.addressee_id, 'actor_id', p_actor_id, 'action', 'removed', 'source', p_source, 'refund_applied', v_refund_applied, 'refund_owner_id', case when v_refund_applied then v_friendship.requester_id else null end))
  on conflict (event_type, aggregate_id) where event_type = 'friendship.removed' do nothing;
  return pg_catalog.jsonb_build_object('found', true, 'success', true, 'refunded', v_refunded, 'balance', case when v_refunded then v_balance else null end, 'friendship_id', v_friendship.id, 'requester_id', v_friendship.requester_id, 'addressee_id', v_friendship.addressee_id);
end;
$$;

create or replace function public.respond_friend_request_idempotent(
  p_actor_id uuid,
  p_friendship_id uuid,
  p_action text,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.idempotency_records%rowtype;
  v_friendship public.friendships%rowtype;
  v_status integer;
  v_body jsonb;
  v_error_code text;
  v_error_message text;
  v_requester_id uuid;
  v_addressee_id uuid;
  v_safe_request_id text := case when p_request_id ~ '^[A-Za-z0-9._:-]{1,128}$' then p_request_id else null end;
begin
  if p_operation is distinct from 'friend_request:respond'
     or p_action not in ('accepted', 'declined')
     or p_actor_id is null
     or p_friendship_id is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('response_status', 400, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Invalid idempotency request', 'message', 'Invalid idempotency request', 'code', 'INVALID_IDEMPOTENCY_KEY', 'request_id', null), 'retry_after_seconds', null, 'replayed', false);
  end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;
  select * into v_stored from public.idempotency_records
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key for update;
  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('response_status', 409, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Idempotency key was already used for a different request', 'message', 'Idempotency key was already used for a different request', 'code', 'IDEMPOTENCY_KEY_REUSED', 'request_id', v_safe_request_id), 'retry_after_seconds', null, 'replayed', false);
  end if;
  if v_stored.response_status is not null and v_stored.response_body is not null then
    return pg_catalog.jsonb_build_object('response_status', v_stored.response_status, 'response_body', v_stored.response_body, 'retry_after_seconds', v_stored.response_retry_after_seconds, 'replayed', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friendship-rate:' || p_actor_id::text || ':' || p_operation, 0));
  insert into public.friendship_mutation_rate_limits (actor_id, operation, window_started_at, request_count, updated_at)
  values (p_actor_id, p_operation, pg_catalog.clock_timestamp(), 0, pg_catalog.clock_timestamp())
  on conflict (actor_id, operation) do nothing;
  update public.friendship_mutation_rate_limits
  set window_started_at = case when window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() then pg_catalog.clock_timestamp() else window_started_at end,
      request_count = case when window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() then 1 else request_count + 1 end,
      updated_at = pg_catalog.clock_timestamp()
  where actor_id = p_actor_id and operation = p_operation
    and (window_started_at + interval '60 seconds' <= pg_catalog.clock_timestamp() or request_count < 20);
  if not found then
    v_status := 429;
    v_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Too many requests', 'message', 'Too many requests', 'code', 'RATE_LIMITED', 'request_id', null);
  else
    select requester_id, addressee_id into v_requester_id, v_addressee_id
    from public.friendships where id = p_friendship_id;
    if v_requester_id is not null and v_addressee_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(case when v_requester_id::text < v_addressee_id::text then v_requester_id::text || ':' || v_addressee_id::text else v_addressee_id::text || ':' || v_requester_id::text end, 0));
    end if;
    select * into v_friendship from public.friendships where id = p_friendship_id for update;
    if v_friendship.id is null or v_friendship.addressee_id <> p_actor_id then
      v_status := 404; v_error_code := 'FRIENDSHIP_NOT_FOUND'; v_error_message := 'Friendship not found';
    elsif v_friendship.status <> 'pending' then
      v_status := 409; v_error_code := 'FRIEND_REQUEST_ALREADY_RESPONDED'; v_error_message := 'Friend request was already responded to';
    elsif p_action = 'declined' then
      delete from public.friendships where id = v_friendship.id;
      v_status := 200; v_body := pg_catalog.jsonb_build_object('status', 'declined', 'friendship', null);
    else
      update public.friendships set status = 'accepted', responded_at = pg_catalog.now() where id = v_friendship.id returning * into v_friendship;
      select pg_catalog.jsonb_build_object(
        'status', 'accepted',
        'friendship', pg_catalog.jsonb_build_object(
          'id', friendship.id, 'requester_id', friendship.requester_id, 'addressee_id', friendship.addressee_id,
          'status', friendship.status, 'requested_at', friendship.requested_at, 'responded_at', friendship.responded_at,
          'requester', pg_catalog.jsonb_build_object('id', requester.id, 'username', requester.username, 'display_name', requester.display_name, 'avatar_url', requester.avatar_url, 'location_text', requester.location_text, 'is_online', coalesce(requester.is_online, false), 'last_seen_at', requester.last_seen_at),
          'addressee', pg_catalog.jsonb_build_object('id', addressee.id, 'username', addressee.username, 'display_name', addressee.display_name, 'avatar_url', addressee.avatar_url, 'location_text', addressee.location_text, 'is_online', coalesce(addressee.is_online, false), 'last_seen_at', addressee.last_seen_at)
        )
      ) into v_body
      from public.friendships friendship
      join public.profiles requester on requester.id = friendship.requester_id
      join public.profiles addressee on addressee.id = friendship.addressee_id
      where friendship.id = v_friendship.id;
      v_status := 200;
    end if;
    if v_status <> 200 and v_body is null then
      v_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', v_error_message, 'message', v_error_message, 'code', v_error_code, 'request_id', v_safe_request_id);
    end if;
  end if;
  update public.idempotency_records set response_status = v_status, response_body = v_body, response_retry_after_seconds = case when v_status = 429 then 60 else null end
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key;
  if v_status = 200 then
    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('friendship.responded', 'friendship', p_friendship_id::text, pg_catalog.jsonb_build_object('friendship_id', p_friendship_id, 'requester_id', v_friendship.requester_id, 'addressee_id', v_friendship.addressee_id, 'actor_id', p_actor_id, 'action', p_action))
    on conflict (event_type, aggregate_id) where event_type = 'friendship.responded' do nothing;
  end if;
  return pg_catalog.jsonb_build_object('response_status', v_status, 'response_body', v_body, 'retry_after_seconds', case when v_status = 429 then 60 else null end, 'replayed', false);
end;
$$;

-- Discovery coordinates are presentation cells. Exact coordinates remain in
-- user_locations for server-side verified proximity decisions only.
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
    where not exists (select 1 from public.user_blocks block where (block.blocker_id = p_user_id and block.blocked_id = candidate.user_id) or (block.blocker_id = candidate.user_id and block.blocked_id = p_user_id))
  )
  select user_id, username, display_name, avatar_url, is_online, last_seen_at, lat, lng from candidates
  where distance_km <= greatest(0.1, least(p_radius_km, 5)) order by distance_km, user_id limit 100;
$$;

-- Opening a conversation is a core social action. Keep the normalized-pair
-- lock and block/profile checks, but never create a wallet, debit coins, or
-- write a coin transaction.
create or replace function public.create_or_find_thread(
  p_user_a uuid,
  p_user_b uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_thread_id uuid;
  v_balance integer;
  v_is_blocked boolean;
  v_user_1 uuid := least(p_user_a, p_user_b);
  v_user_2 uuid := greatest(p_user_a, p_user_b);
begin
  if p_user_a = p_user_b then
    return pg_catalog.jsonb_build_object('error', 'SELF_MESSAGE', 'message', 'Cannot message yourself', 'status', 400);
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_user_a and profile.deleted_at is null)
     or not exists (select 1 from public.profiles profile where profile.id = p_user_b and profile.deleted_at is null) then
    return pg_catalog.jsonb_build_object('error', 'USER_NOT_FOUND', 'message', 'User not found', 'status', 404);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_1::text || ':' || v_user_2::text, 0));
  select exists (select 1 from public.user_blocks block where (block.blocker_id = p_user_a and block.blocked_id = p_user_b) or (block.blocker_id = p_user_b and block.blocked_id = p_user_a)) into v_is_blocked;
  if v_is_blocked then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED', 'message', 'User not found', 'status', 404);
  end if;
  select id into v_thread_id from public.dm_threads where participant_1_id = v_user_1 and participant_2_id = v_user_2;
  select balance into v_balance from public.user_coins where user_id = p_user_a;
  if v_thread_id is not null then
    return pg_catalog.jsonb_build_object('id', v_thread_id, 'thread_id', v_thread_id, 'is_new', false, 'balance', coalesce(v_balance, 0));
  end if;
  insert into public.dm_threads (participant_1_id, participant_2_id)
  values (v_user_1, v_user_2)
  returning id into v_thread_id;
  return pg_catalog.jsonb_build_object('id', v_thread_id, 'thread_id', v_thread_id, 'is_new', true, 'balance', coalesce(v_balance, 0));
end;
$$;

-- These RPCs are reached only through authenticated server routes using the
-- service role. Explicit privileges prevent direct client invocation.
revoke all on function public.send_friend_request_idempotent(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.send_friend_request_idempotent(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.friendship_removal_core(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.friendship_removal_core(uuid, uuid, text) to service_role;
revoke all on function public.respond_friend_request_idempotent(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.respond_friend_request_idempotent(uuid, uuid, text, text, text, text, text) to service_role;
revoke all on function public.nearby_users_for_user(uuid, double precision) from public, anon, authenticated;
grant execute on function public.nearby_users_for_user(uuid, double precision) to service_role;
revoke all on function public.create_or_find_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_or_find_thread(uuid, uuid) to service_role;
