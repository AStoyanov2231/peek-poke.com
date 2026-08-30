-- Friendship removal depends on the durable-workflow foundation. Applying it
-- out of order must fail instead of exposing a non-idempotent fallback.
do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.friendships') is null
     or pg_catalog.to_regclass('public.user_coins') is null
     or pg_catalog.to_regclass('public.coin_transactions') is null
     or pg_catalog.to_regclass('public.user_blocks') is null
     or pg_catalog.to_regclass('public.friendship_mutation_rate_limits') is null then
    raise exception 'durable workflows and friendship tables must be applied first';
  end if;
end;
$$;

-- Block uses the same durable response field as friend request/response, but
-- its historical quota is a day-long window rather than a minute-long one.
alter table public.idempotency_records
  drop constraint if exists idempotency_records_response_retry_after_seconds_check;
alter table public.idempotency_records
  add constraint idempotency_records_response_retry_after_seconds_check
  check (
    response_retry_after_seconds is null
    or response_retry_after_seconds between 1 and 86400
  );

alter table public.friendship_mutation_rate_limits
  drop constraint if exists friendship_mutation_rate_limits_denied_retry_after_seconds_check;
alter table public.friendship_mutation_rate_limits
  add constraint friendship_mutation_rate_limits_denied_retry_after_seconds_check
  check (
    denied_retry_after_seconds is null
    or denied_retry_after_seconds between 1 and 86400
  );

alter table public.friendship_mutation_rate_limits
  drop constraint if exists friendship_mutation_rate_limits_operation_check;
alter table public.friendship_mutation_rate_limits
  add constraint friendship_mutation_rate_limits_operation_check
  check (
    operation in ('friend_request:create', 'friend_request:respond', 'user:block')
  );

-- A friendship UUID can produce at most one refund, even if removal is raced
-- through different idempotency keys or through DELETE and block_user.
create table if not exists public.friendship_refunds (
  friendship_id uuid primary key,
  requester_id uuid not null,
  addressee_id uuid not null,
  source text not null check (source in ('delete', 'block')),
  coin_transaction_id uuid unique,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.friendship_refunds enable row level security;
drop policy if exists "friendship refunds are server only" on public.friendship_refunds;
create policy "friendship refunds are server only"
  on public.friendship_refunds
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.friendship_refunds from public, anon, authenticated;
grant all on public.friendship_refunds to service_role;

create unique index if not exists outbox_events_friendship_removed_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'friendship.removed';

create unique index if not exists outbox_events_user_blocked_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'user.blocked';

-- Every path that deletes a friendship calls this function. The normalized
-- pair advisory lock is shared with request creation/response and block_user;
-- the row and wallet locks make deletion, refund, ledger, and outbox atomic.
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
  v_refund_claimed integer := 0;
  v_coin_transaction_id uuid;
  v_balance integer;
  v_refund_applied boolean := false;
  v_refunded boolean := false;
begin
  if p_source not in ('delete', 'block') then
    raise exception 'invalid friendship removal source';
  end if;

  -- Read the immutable pair only to select the normalized lock. The row is
  -- re-read FOR UPDATE after the pair lock, so a concurrent winner is observed.
  select friendship.requester_id, friendship.addressee_id
  into v_requester_id, v_addressee_id
  from public.friendships friendship
  where friendship.id = p_friendship_id;

  if v_requester_id is null or v_addressee_id is null then
    return pg_catalog.jsonb_build_object(
      'found', false,
      'success', false,
      'refunded', false,
      'balance', null
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      case
        when v_requester_id::text < v_addressee_id::text
          then v_requester_id::text || ':' || v_addressee_id::text
        else v_addressee_id::text || ':' || v_requester_id::text
      end,
      0
    )
  );

  select friendship.*
  into v_friendship
  from public.friendships friendship
  where friendship.id = p_friendship_id
  for update;

  if v_friendship.id is null
     or p_actor_id not in (v_friendship.requester_id, v_friendship.addressee_id) then
    return pg_catalog.jsonb_build_object(
      'found', false,
      'success', false,
      'refunded', false,
      'balance', null
    );
  end if;

  -- A pending request has already charged its immutable original requester.
  -- Whichever participant/path wins removal must restore that requester once.
  if v_friendship.status = 'pending' then
    v_refund_applied := true;
    insert into public.friendship_refunds (
      friendship_id,
      requester_id,
      addressee_id,
      source
    )
    values (
      v_friendship.id,
      v_friendship.requester_id,
      v_friendship.addressee_id,
      p_source
    )
    on conflict (friendship_id) do nothing;
    get diagnostics v_refund_claimed = row_count;

    -- A missing wallet is repaired to the platform default before recording
    -- the refund. Existing balances are locked and remain capped at five.
    insert into public.user_coins (user_id, balance)
    values (v_friendship.requester_id, 5)
    on conflict (user_id) do nothing;

    select wallet.balance
    into v_balance
    from public.user_coins wallet
    where wallet.user_id = v_friendship.requester_id
    for update;

    if v_balance is null then
      raise exception 'requester wallet is unavailable';
    end if;

    if v_refund_claimed = 1 then
      update public.user_coins wallet
      set balance = pg_catalog.least(wallet.balance + 1, 5),
          updated_at = pg_catalog.now()
      where wallet.user_id = v_friendship.requester_id
      returning wallet.balance into v_balance;

      insert into public.coin_transactions (
        user_id,
        amount,
        reason,
        related_user_id
      )
      values (
        v_friendship.requester_id,
        1,
        'request_cancelled_refund',
        v_friendship.addressee_id
      )
      returning id into v_coin_transaction_id;

      update public.friendship_refunds refund
      set coin_transaction_id = v_coin_transaction_id
      where refund.friendship_id = v_friendship.id;
    end if;

    -- Refund ownership is caller-visible only to the wallet owner. A recipient
    -- who wins DELETE/block receives the neutral public DTO and no balance.
    v_refunded := p_actor_id = v_friendship.requester_id;
  end if;

  delete from public.friendships friendship
  where friendship.id = v_friendship.id;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'friendship.removed',
    'friendship',
    v_friendship.id::text,
    pg_catalog.jsonb_build_object(
      'friendship_id', v_friendship.id,
      'requester_id', v_friendship.requester_id,
      'addressee_id', v_friendship.addressee_id,
      'actor_id', p_actor_id,
      'action', 'removed',
      'source', p_source,
      'refund_applied', v_refund_applied,
      'refund_owner_id', case
        when v_refund_applied then v_friendship.requester_id
        else null
      end
    )
  )
  on conflict (event_type, aggregate_id)
  where event_type = 'friendship.removed'
  do nothing;

  return pg_catalog.jsonb_build_object(
    'found', true,
    'success', true,
    'refunded', v_refunded,
    'balance', case when v_refunded then v_balance else null end,
    'friendship_id', v_friendship.id,
    'requester_id', v_friendship.requester_id,
    'addressee_id', v_friendship.addressee_id
  );
end;
$$;

revoke all on function public.friendship_removal_core(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.friendship_removal_core(uuid, uuid, text)
  to service_role;

-- Fence the legacy service RPC through the same lock/refund invariant.
create or replace function public.unfriend(
  p_friendship_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.friendship_removal_core(
    p_friendship_id,
    p_user_id,
    'delete'
  );
  if coalesce((v_result ->> 'found')::boolean, false) is false then
    return pg_catalog.jsonb_build_object(
      'error', 'NOT_FOUND',
      'message', 'Friendship not found',
      'status', 404
    );
  end if;
  return v_result - 'found' - 'friendship_id' - 'requester_id' - 'addressee_id';
end;
$$;

revoke all on function public.unfriend(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unfriend(uuid, uuid) to service_role;

-- Blocking shares the normalized pair lock with every friendship mutation and
-- routes any deletion/refund through friendship_removal_core.
create or replace function public.block_user_with_friendship_fence(
  p_blocker_id uuid,
  p_blocked_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block_id uuid;
  v_friendship_id uuid;
  v_removal jsonb;
begin
  if p_blocker_id = p_blocked_id then
    return pg_catalog.jsonb_build_object(
      'error', 'SELF_BLOCK',
      'message', 'Cannot block yourself',
      'status', 400
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      case
        when p_blocker_id::text < p_blocked_id::text
          then p_blocker_id::text || ':' || p_blocked_id::text
        else p_blocked_id::text || ':' || p_blocker_id::text
      end,
      0
    )
  );

  insert into public.user_blocks (blocker_id, blocked_id)
  values (p_blocker_id, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing
  returning id into v_block_id;

  if v_block_id is null then
    select block.id
    into v_block_id
    from public.user_blocks block
    where block.blocker_id = p_blocker_id
      and block.blocked_id = p_blocked_id;
  end if;

  select friendship.id
  into v_friendship_id
  from public.friendships friendship
  where (friendship.requester_id = p_blocker_id and friendship.addressee_id = p_blocked_id)
     or (friendship.requester_id = p_blocked_id and friendship.addressee_id = p_blocker_id)
  limit 1;

  if v_friendship_id is not null then
    v_removal := public.friendship_removal_core(
      v_friendship_id,
      p_blocker_id,
      'block'
    );
  end if;

  -- A lost HTTP response must not lose cross-client convergence. Reusing the
  -- durable block row as aggregate identity deduplicates retries while allowing
  -- a later unblock/re-block cycle to emit a new event.
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'user.blocked',
    'user_block',
    v_block_id::text,
    pg_catalog.jsonb_build_object(
      'friendship_id', pg_catalog.coalesce(v_friendship_id, v_block_id),
      'requester_id', p_blocker_id,
      'addressee_id', p_blocked_id,
      'actor_id', p_blocker_id,
      'action', 'blocked'
    )
  )
  on conflict (event_type, aggregate_id)
  where event_type = 'user.blocked'
  do nothing;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'refunded', coalesce((v_removal ->> 'refunded')::boolean, false),
    'balance', case when v_removal is null then null else v_removal -> 'balance' end
  );
end;
$$;

revoke all on function public.block_user_with_friendship_fence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.block_user_with_friendship_fence(uuid, uuid)
  to service_role;

-- Keep the legacy service-only RPC behind the same implementation while the
-- backend calls the new name so a missing migration fails closed.
create or replace function public.block_user(
  p_blocker_id uuid,
  p_blocked_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.block_user_with_friendship_fence(p_blocker_id, p_blocked_id);
$$;

revoke all on function public.block_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid, uuid) to service_role;

create or replace function public.remove_friendship_idempotent(
  p_actor_id uuid,
  p_friendship_id uuid,
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
  v_claimed integer := 0;
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_response_status integer;
  v_response_body jsonb;
  v_safe_request_id text;
  v_removal jsonb;
begin
  if p_operation is distinct from 'friendship:remove'
     or p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) < 16
     or pg_catalog.char_length(p_idempotency_key) > 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object(
      'response_status', 400,
      'response_body', pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Invalid idempotency request',
        'message', 'Invalid idempotency request',
        'code', 'INVALID_IDEMPOTENCY_KEY',
        'request_id', null
      ),
      'replayed', false
    );
  end if;

  v_safe_request_id := case
    when p_request_id ~ '^[A-Za-z0-9._:-]{1,128}$' then p_request_id
    else null
  end;

  insert into public.idempotency_records (
    actor_id,
    operation,
    key,
    request_hash
  )
  values (
    p_actor_id,
    p_operation,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (actor_id, operation, key) do nothing;
  get diagnostics v_claimed = row_count;

  select record.request_hash, record.response_status, record.response_body
  into v_stored_hash, v_stored_status, v_stored_body
  from public.idempotency_records record
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency claim is unavailable';
  end if;

  if v_stored_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object(
      'response_status', 409,
      'response_body', pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Idempotency key was already used for a different request',
        'message', 'Idempotency key was already used for a different request',
        'code', 'IDEMPOTENCY_KEY_REUSED',
        'request_id', v_safe_request_id
      ),
      'replayed', false
    );
  end if;

  if v_stored_status is not null and v_stored_body is not null then
    return pg_catalog.jsonb_build_object(
      'response_status', v_stored_status,
      'response_body', v_stored_body,
      'replayed', true
    );
  end if;

  -- A conflicting insert waits for the first transaction. A visible but
  -- incomplete prior claim is never safe to execute as a second owner.
  if v_claimed <> 1 then
    raise exception 'incomplete idempotency claim is unavailable';
  end if;

  v_removal := public.friendship_removal_core(
    p_friendship_id,
    p_actor_id,
    'delete'
  );

  if coalesce((v_removal ->> 'found')::boolean, false) then
    v_response_status := 200;
    v_response_body := pg_catalog.jsonb_build_object(
      'success', true,
      'refunded', (v_removal ->> 'refunded')::boolean,
      'balance', v_removal -> 'balance'
    );
  else
    v_response_status := 404;
    v_response_body := pg_catalog.jsonb_build_object(
      'version', 'v1',
      'error', 'Friendship not found',
      'message', 'Friendship not found',
      'code', 'FRIENDSHIP_NOT_FOUND',
      'request_id', v_safe_request_id
    );
  end if;

  update public.idempotency_records record
  set response_status = v_response_status,
      response_body = v_response_body
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key;

  return pg_catalog.jsonb_build_object(
    'response_status', v_response_status,
    'response_body', v_response_body,
    'replayed', false
  );
end;
$$;

revoke all on function public.remove_friendship_idempotent(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.remove_friendship_idempotent(
  uuid, uuid, text, text, text, text
) to service_role;

-- Block owns its idempotency claim and rate-limit bucket in the same database
-- transaction as the block, friendship deletion, refund, ledger, and outbox.
create or replace function public.block_user_idempotent(
  p_actor_id uuid,
  p_blocked_id uuid,
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
  v_claimed integer := 0;
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_stored_retry_after_seconds integer;
  v_response_status integer;
  v_response_body jsonb;
  v_retry_after_seconds integer;
  v_rate_limit integer := 20;
  v_rate_window_seconds integer := 86400;
  v_rate_count integer;
  v_rate_now timestamptz;
  v_rate_window_reset boolean := false;
  v_rate_window_started_at timestamptz;
  v_rate_reset_at timestamptz;
  v_bucket_denied_body jsonb;
  v_bucket_denied_retry_after_seconds integer;
  v_safe_request_id text;
  v_block jsonb;
begin
  if p_operation is distinct from 'user:block'
     or p_actor_id = p_blocked_id
     or p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) < 16
     or pg_catalog.char_length(p_idempotency_key) > 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object(
      'response_status', 400,
      'response_body', pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Invalid idempotency request',
        'message', 'Invalid idempotency request',
        'code', 'INVALID_IDEMPOTENCY_KEY',
        'request_id', null
      ),
      'retry_after_seconds', null,
      'replayed', false
    );
  end if;

  v_safe_request_id := case
    when p_request_id ~ '^[A-Za-z0-9._:-]{1,128}$' then p_request_id
    else null
  end;

  delete from public.idempotency_records record
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key
    and record.expires_at <= pg_catalog.clock_timestamp();

  select
    record.request_hash,
    record.response_status,
    record.response_body,
    record.response_retry_after_seconds
  into
    v_stored_hash,
    v_stored_status,
    v_stored_body,
    v_stored_retry_after_seconds
  from public.idempotency_records record
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key
  for update;

  if found then
    if v_stored_hash is distinct from p_request_hash then
      return pg_catalog.jsonb_build_object(
        'response_status', 409,
        'response_body', pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Idempotency key was already used for a different request',
          'message', 'Idempotency key was already used for a different request',
          'code', 'IDEMPOTENCY_KEY_REUSED',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    elsif v_stored_status is not null and v_stored_body is not null then
      return pg_catalog.jsonb_build_object(
        'response_status', v_stored_status,
        'response_body', v_stored_body,
        'retry_after_seconds', v_stored_retry_after_seconds,
        'replayed', true
      );
    else
      return pg_catalog.jsonb_build_object(
        'response_status', 503,
        'response_body', pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Block service temporarily unavailable',
          'message', 'Block service temporarily unavailable',
          'code', 'BLOCK_IDEMPOTENCY_UNAVAILABLE',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    end if;
  end if;

  -- Unseen keys serialize on one bounded actor+operation lock. Denied keys do
  -- not create idempotency rows, so an attacker cannot amplify one active
  -- window into unbounded durable writes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'friendship-rate:' || p_actor_id::text || ':' || p_operation,
      0
    )
  );
  v_rate_now := pg_catalog.clock_timestamp();
  select
    bucket.request_count,
    bucket.window_started_at,
    bucket.denied_response_body,
    bucket.denied_retry_after_seconds
  into
    v_rate_count,
    v_rate_window_started_at,
    v_bucket_denied_body,
    v_bucket_denied_retry_after_seconds
  from public.friendship_mutation_rate_limits bucket
  where bucket.actor_id = p_actor_id
    and bucket.operation = p_operation;

  if not found then
    insert into public.friendship_mutation_rate_limits (
      actor_id,
      operation,
      window_started_at,
      request_count,
      updated_at
    )
    values (
      p_actor_id,
      p_operation,
      v_rate_now,
      0,
      v_rate_now
    );
    v_rate_count := 0;
    v_rate_window_started_at := v_rate_now;
    v_bucket_denied_body := null;
    v_bucket_denied_retry_after_seconds := null;
    v_rate_window_reset := true;
  end if;

  if v_rate_window_started_at + (v_rate_window_seconds * interval '1 second')
      <= v_rate_now then
    update public.friendship_mutation_rate_limits bucket
    set window_started_at = v_rate_now,
        request_count = 0,
        denied_response_body = null,
        denied_retry_after_seconds = null,
        updated_at = v_rate_now
    where bucket.actor_id = p_actor_id
      and bucket.operation = p_operation
    returning
      bucket.request_count,
      bucket.window_started_at,
      bucket.denied_response_body,
      bucket.denied_retry_after_seconds
    into
      v_rate_count,
      v_rate_window_started_at,
      v_bucket_denied_body,
      v_bucket_denied_retry_after_seconds;
    v_rate_window_reset := true;
  end if;

  -- A same-key winner may have committed while this caller waited for the
  -- actor+operation lock. Recheck before quota or claim writes.
  select
    record.request_hash,
    record.response_status,
    record.response_body,
    record.response_retry_after_seconds
  into
    v_stored_hash,
    v_stored_status,
    v_stored_body,
    v_stored_retry_after_seconds
  from public.idempotency_records record
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key
  for update;

  if found then
    if v_stored_hash is distinct from p_request_hash then
      return pg_catalog.jsonb_build_object(
        'response_status', 409,
        'response_body', pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Idempotency key was already used for a different request',
          'message', 'Idempotency key was already used for a different request',
          'code', 'IDEMPOTENCY_KEY_REUSED',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    elsif v_stored_status is not null and v_stored_body is not null then
      return pg_catalog.jsonb_build_object(
        'response_status', v_stored_status,
        'response_body', v_stored_body,
        'retry_after_seconds', v_stored_retry_after_seconds,
        'replayed', true
      );
    else
      return pg_catalog.jsonb_build_object(
        'response_status', 503,
        'response_body', pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Block service temporarily unavailable',
          'message', 'Block service temporarily unavailable',
          'code', 'BLOCK_IDEMPOTENCY_UNAVAILABLE',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    end if;
  end if;

  if v_rate_window_reset then
    with expired as (
      select record.ctid
      from public.idempotency_records record
      where record.actor_id = p_actor_id
        and record.operation = p_operation
        and record.key <> p_idempotency_key
        and record.expires_at <= pg_catalog.clock_timestamp()
      order by record.expires_at asc
      limit 100
    )
    delete from public.idempotency_records record
    using expired
    where record.ctid = expired.ctid;
  end if;

  v_rate_reset_at := v_rate_window_started_at
    + (v_rate_window_seconds * interval '1 second');
  if v_rate_count >= v_rate_limit then
    if v_bucket_denied_body is null or v_bucket_denied_retry_after_seconds is null then
      v_bucket_denied_retry_after_seconds := pg_catalog.least(
        v_rate_window_seconds,
        pg_catalog.greatest(
          1,
          pg_catalog.ceil(
            extract(
              epoch from (v_rate_reset_at - pg_catalog.clock_timestamp())
            )
          )::integer
        )
      );
      v_bucket_denied_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Too many block requests',
        'message', 'Too many block requests',
        'code', 'RATE_LIMITED',
        'request_id', null
      );
      update public.friendship_mutation_rate_limits bucket
      set denied_response_body = v_bucket_denied_body,
          denied_retry_after_seconds = v_bucket_denied_retry_after_seconds,
          updated_at = pg_catalog.clock_timestamp()
      where bucket.actor_id = p_actor_id
        and bucket.operation = p_operation;
    end if;

    -- Rejected keys are deliberately unclaimed and make no per-key writes.
    -- Any key/hash may be reused after rollover; claimed keys above remain
    -- permanently bound to their original target/hash until claim expiry.
    return pg_catalog.jsonb_build_object(
      'response_status', 429,
      'response_body', v_bucket_denied_body,
      'retry_after_seconds', v_bucket_denied_retry_after_seconds,
      'replayed', false
    );
  end if;

  insert into public.idempotency_records (
    actor_id,
    operation,
    key,
    request_hash
  )
  values (
    p_actor_id,
    p_operation,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (actor_id, operation, key) do nothing;
  get diagnostics v_claimed = row_count;

  if v_claimed <> 1 then
    return pg_catalog.jsonb_build_object(
      'response_status', 503,
      'response_body', pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Block service temporarily unavailable',
        'message', 'Block service temporarily unavailable',
        'code', 'BLOCK_IDEMPOTENCY_UNAVAILABLE',
        'request_id', v_safe_request_id
      ),
      'retry_after_seconds', null,
      'replayed', false
    );
  end if;

  update public.friendship_mutation_rate_limits bucket
  set request_count = bucket.request_count + 1,
      updated_at = pg_catalog.clock_timestamp()
  where bucket.actor_id = p_actor_id
    and bucket.operation = p_operation;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_blocked_id
      and profile.deleted_at is null
  ) then
    v_response_status := 404;
    v_response_body := pg_catalog.jsonb_build_object(
      'version', 'v1',
      'error', 'User not found',
      'message', 'User not found',
      'code', 'USER_NOT_FOUND',
      'request_id', v_safe_request_id
    );
  else
    v_block := public.block_user_with_friendship_fence(p_actor_id, p_blocked_id);
    if v_block ? 'error' then
      raise exception 'fenced block failed: %', v_block ->> 'error';
    end if;
    v_response_status := 200;
    v_response_body := pg_catalog.jsonb_build_object(
      'success', true,
      'refunded', pg_catalog.coalesce((v_block ->> 'refunded')::boolean, false),
      'balance', case
        when pg_catalog.coalesce((v_block ->> 'refunded')::boolean, false)
          then v_block -> 'balance'
        else null
      end
    );
  end if;
  v_retry_after_seconds := null;

  update public.idempotency_records record
  set response_status = v_response_status,
      response_body = v_response_body,
      response_retry_after_seconds = v_retry_after_seconds
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key;

  return pg_catalog.jsonb_build_object(
    'response_status', v_response_status,
    'response_body', v_response_body,
    'retry_after_seconds', v_retry_after_seconds,
    'replayed', false
  );
end;
$$;

revoke all on function public.block_user_idempotent(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.block_user_idempotent(
  uuid, uuid, text, text, text, text
) to service_role;
