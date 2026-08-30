-- This migration deliberately depends on the durable-workflow foundation.
-- Deploying it out of order must fail instead of silently weakening exactly-once behavior.
do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.outbox_events') is null then
    raise exception '20260729235452_durable_workflows.sql must be applied first';
  end if;
end;
$$;

create unique index if not exists outbox_events_friend_request_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'friendship.requested';

alter table public.idempotency_records
  add column if not exists response_retry_after_seconds integer
  check (
    response_retry_after_seconds is null
    or response_retry_after_seconds between 1 and 60
  );

-- One reusable row per actor and friendship operation bounds limiter state.
-- Rows disappear with the actor, and windows reset in place instead of
-- accumulating time-bucket records.
create table if not exists public.friendship_mutation_rate_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (
    operation in ('friend_request:create', 'friend_request:respond')
  ),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 0 and 61),
  denied_response_body jsonb,
  denied_retry_after_seconds integer check (
    denied_retry_after_seconds is null
    or denied_retry_after_seconds between 1 and 60
  ),
  updated_at timestamptz not null,
  check (
    (denied_response_body is null and denied_retry_after_seconds is null)
    or (denied_response_body is not null and denied_retry_after_seconds is not null)
  ),
  primary key (actor_id, operation)
);

alter table public.friendship_mutation_rate_limits enable row level security;
drop policy if exists "friendship mutation rate limits are server only"
  on public.friendship_mutation_rate_limits;
create policy "friendship mutation rate limits are server only"
  on public.friendship_mutation_rate_limits
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.friendship_mutation_rate_limits
  from public, anon, authenticated;

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
  v_claimed integer := 0;
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_stored_retry_after_seconds integer;
  v_response_status integer;
  v_response_body jsonb;
  v_rate_limit integer := 20;
  v_rate_window_seconds integer := 60;
  v_rate_count integer;
  v_rate_now timestamptz;
  v_rate_window_reset boolean := false;
  v_rate_window_started_at timestamptz;
  v_rate_reset_at timestamptz;
  v_bucket_denied_body jsonb;
  v_bucket_denied_retry_after_seconds integer;
  v_error_code text;
  v_error_message text;
  v_existing public.friendships%rowtype;
  v_friendship public.friendships%rowtype;
  v_balance integer;
  v_friend_count integer;
  v_is_premium boolean := false;
  v_is_blocked boolean := false;
  v_safe_request_id text;
begin
  if p_operation is distinct from 'friend_request:create'
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
          'error', 'Friend request service temporarily unavailable',
          'message', 'Friend request service temporarily unavailable',
          'code', 'FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    end if;
  end if;

  -- Unseen keys serialize on one bounded actor+operation row. No denied key is
  -- persisted separately; one deterministic rejection is stored per window.
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

  -- A same-key transaction may have committed while this unseen caller waited
  -- for the bucket. Recheck before making any quota decision.
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
          'error', 'Friend request service temporarily unavailable',
          'message', 'Friend request service temporarily unavailable',
          'code', 'FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE',
          'request_id', v_safe_request_id
        ),
        'retry_after_seconds', null,
        'replayed', false
      );
    end if;
  end if;

  -- Opportunistically drain this actor+operation's expired keys in a bounded
  -- batch. The global workflow cleanup remains the backstop for idle actors.
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
            extract(epoch from (v_rate_reset_at - pg_catalog.clock_timestamp()))
          )::integer
        )
      );
      v_bucket_denied_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Too many requests',
        'message', 'Too many requests',
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

    -- Rejected keys are deliberately unclaimed. Any key/hash receives this
    -- window's same bounded rejection; after rollover either payload may win a
    -- fresh claim. Claimed keys above retain strict hash-conflict semantics.
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
        'error', 'Friend request service temporarily unavailable',
        'message', 'Friend request service temporarily unavailable',
        'code', 'FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE',
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

  begin
    -- Serialize every orientation of the same pair, including requests made
    -- with different idempotency keys.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        case
          when p_actor_id::text < p_addressee_id::text
            then p_actor_id::text || ':' || p_addressee_id::text
          else p_addressee_id::text || ':' || p_actor_id::text
        end,
        0
      )
    );

    if not exists (
      select 1
      from public.profiles profile
      where profile.id = p_addressee_id
        and profile.deleted_at is null
    ) then
      v_response_status := 404;
      v_error_code := 'USER_NOT_FOUND';
      v_error_message := 'User not found';
    elsif p_actor_id = p_addressee_id then
      v_response_status := 400;
      v_error_code := 'SELF_REQUEST';
      v_error_message := 'Cannot add yourself';
    end if;

    if v_response_status is null then
      select exists(
        select 1
        from public.user_blocks block
        where (block.blocker_id = p_addressee_id and block.blocked_id = p_actor_id)
           or (block.blocker_id = p_actor_id and block.blocked_id = p_addressee_id)
      ) into v_is_blocked;
      if v_is_blocked then
        v_response_status := 403;
        v_error_code := 'BLOCKED';
        v_error_message := 'Cannot send request';
      end if;
    end if;

    if v_response_status is null then
      select friendship.*
      into v_existing
      from public.friendships friendship
      where (friendship.requester_id = p_actor_id and friendship.addressee_id = p_addressee_id)
         or (friendship.requester_id = p_addressee_id and friendship.addressee_id = p_actor_id)
      limit 1;
      if v_existing.id is not null and v_existing.status = 'accepted' then
        v_response_status := 409;
        v_error_code := 'ALREADY_FRIENDS';
        v_error_message := 'Already friends';
      elsif v_existing.id is not null and v_existing.status = 'pending' then
        v_response_status := 409;
        v_error_code := 'ALREADY_PENDING';
        v_error_message := 'Request already pending';
      end if;
    end if;

    if v_response_status is null then
      select exists(
        select 1
        from public.user_roles user_role
        join public.roles role on role.id = user_role.role_id
        where user_role.user_id = p_actor_id
          and role.name = 'subscriber'
      ) into v_is_premium;

      select pg_catalog.count(*)::integer
      into v_friend_count
      from public.friendships friendship
      where (friendship.requester_id = p_actor_id or friendship.addressee_id = p_actor_id)
        and friendship.status = 'accepted';

      if v_is_premium and v_friend_count >= 100 then
        v_response_status := 403;
        v_error_code := 'FRIEND_LIMIT_REACHED';
        v_error_message := 'You have reached the maximum number of friends (100).';
      elsif not v_is_premium and v_friend_count >= 20 then
        v_response_status := 403;
        v_error_code := 'FRIEND_LIMIT_REACHED';
        v_error_message := 'Free accounts can have up to 20 friends. Upgrade to Premium for up to 100!';
      end if;
    end if;

    if v_response_status is null then
      select wallet.balance
      into v_balance
      from public.user_coins wallet
      where wallet.user_id = p_actor_id
      for update;

      if v_balance is null then
        insert into public.user_coins (user_id, balance)
        values (p_actor_id, 5)
        on conflict (user_id) do nothing;
        select wallet.balance
        into v_balance
        from public.user_coins wallet
        where wallet.user_id = p_actor_id
        for update;
      end if;

      if v_balance < 1 then
        v_response_status := 403;
        v_error_code := 'INSUFFICIENT_COINS';
        v_error_message := 'You need at least 1 coin to send a friend request. Meet friends IRL to earn more!';
      end if;
    end if;

    if v_response_status is null then
      update public.user_coins wallet
      set balance = wallet.balance - 1,
          updated_at = pg_catalog.now()
      where wallet.user_id = p_actor_id;

      insert into public.coin_transactions (
        user_id,
        amount,
        reason,
        related_user_id
      )
      values (p_actor_id, -1, 'friend_request_sent', p_addressee_id);

      insert into public.friendships (
        requester_id,
        addressee_id,
        status,
        requested_at
      )
      values (p_actor_id, p_addressee_id, 'pending', pg_catalog.now())
      returning * into v_friendship;

      v_response_status := 200;
      v_response_body := pg_catalog.jsonb_build_object(
        'friendship', pg_catalog.jsonb_build_object(
          'id', v_friendship.id,
          'requester_id', v_friendship.requester_id,
          'addressee_id', v_friendship.addressee_id,
          'status', v_friendship.status,
          'requested_at', v_friendship.requested_at,
          'responded_at', v_friendship.responded_at
        ),
        'balance', v_balance - 1
      );
    end if;
  exception
    when others then
      v_response_status := 500;
      v_error_code := 'FRIEND_REQUEST_FAILED';
      v_error_message := 'Internal server error';
      v_response_body := null;
  end;

  if v_response_status <> 200 then
    v_response_body := pg_catalog.jsonb_build_object(
      'version', 'v1',
      'error', v_error_message,
      'message', v_error_message,
      'code', v_error_code,
      'request_id', v_safe_request_id
    );
  end if;

  update public.idempotency_records record
  set response_status = v_response_status,
      response_body = v_response_body,
      response_retry_after_seconds = null
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key;

  if v_response_status = 200 then
    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'friendship.requested',
      'friendship',
      v_friendship.id::text,
      pg_catalog.jsonb_build_object(
        'friendship_id', v_friendship.id,
        'requester_id', p_actor_id,
        'addressee_id', p_addressee_id,
        'action', 'requested'
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'response_status', v_response_status,
    'response_body', v_response_body,
    'retry_after_seconds', null,
    'replayed', false
  );
end;
$$;

revoke all on function public.send_friend_request_idempotent(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.send_friend_request_idempotent(
  uuid, uuid, text, text, text, text
) to service_role;
