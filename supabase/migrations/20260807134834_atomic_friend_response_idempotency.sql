-- Friendship responses require the durable-workflow foundation. The versioned
-- RPC below owns its business invariants instead of delegating them to a
-- mutable legacy function.
do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.friendship_mutation_rate_limits') is null then
    raise exception 'durable workflows must be applied first';
  end if;
end;
$$;

create unique index if not exists outbox_events_friend_response_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'friendship.responded';

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
  v_claimed integer := 0;
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_stored_retry_after_seconds integer;
  v_response_status integer;
  v_response_body jsonb;
  v_rate_limit integer := 60;
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
  v_safe_request_id text;
  v_requester_id uuid;
  v_addressee_id uuid;
  v_first_participant_id uuid;
  v_second_participant_id uuid;
  v_requester_friend_count integer;
  v_addressee_friend_count integer;
  v_requester_is_premium boolean := false;
  v_addressee_is_premium boolean := false;
  v_friendship public.friendships%rowtype;
begin
  if p_operation is distinct from 'friend_request:respond'
     or p_action not in ('accepted', 'declined')
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
          'error', 'Friend response service temporarily unavailable',
          'message', 'Friend response service temporarily unavailable',
          'code', 'FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE',
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
          'error', 'Friend response service temporarily unavailable',
          'message', 'Friend response service temporarily unavailable',
          'code', 'FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE',
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
        'error', 'Friend response service temporarily unavailable',
        'message', 'Friend response service temporarily unavailable',
        'code', 'FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE',
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

  if v_response_status is null then
    -- Read the immutable pair, then lock both participant identities in one
    -- global order. Different friendships that share either user therefore
    -- cannot both validate a stale friend count. The participant locks precede
    -- the pair and row locks on every business-mutation path.
    select friendship.requester_id, friendship.addressee_id
    into v_requester_id, v_addressee_id
    from public.friendships friendship
    where friendship.id = p_friendship_id;

    if v_requester_id is not null and v_addressee_id is not null then
      v_first_participant_id := case
        when v_requester_id::text < v_addressee_id::text
          then v_requester_id
        else v_addressee_id
      end;
      v_second_participant_id := case
        when v_requester_id::text < v_addressee_id::text
          then v_addressee_id
        else v_requester_id
      end;

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'friend-limit:' || v_first_participant_id::text,
          0
        )
      );
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'friend-limit:' || v_second_participant_id::text,
          0
        )
      );

      -- Retain the normalized pair lock shared with friend-request creation.
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
    end if;

    select friendship.*
    into v_friendship
    from public.friendships friendship
    where friendship.id = p_friendship_id
    for update;

    if v_friendship.id is null or v_friendship.addressee_id <> p_actor_id then
      v_response_status := 404;
      v_error_code := 'FRIENDSHIP_NOT_FOUND';
      v_error_message := 'Friendship not found';
    elsif v_friendship.status <> 'pending' then
      v_response_status := 409;
      v_error_code := 'FRIEND_REQUEST_ALREADY_RESPONDED';
      v_error_message := 'Friend request was already responded to';
    end if;
  end if;

  if v_response_status is null then
    begin
      if p_action = 'accepted' then
        -- Both identity locks are held. Re-read both limits immediately before
        -- the state transition so concurrent accepts on different friendship
        -- rows cannot push either participant above their account limit.
        select exists (
          select 1
          from public.user_roles user_role
          join public.roles role on role.id = user_role.role_id
          where user_role.user_id = v_requester_id
            and role.name = 'subscriber'
        ) into v_requester_is_premium;

        select exists (
          select 1
          from public.user_roles user_role
          join public.roles role on role.id = user_role.role_id
          where user_role.user_id = v_addressee_id
            and role.name = 'subscriber'
        ) into v_addressee_is_premium;

        select pg_catalog.count(*)::integer
        into v_requester_friend_count
        from public.friendships friendship
        where friendship.status = 'accepted'
          and (
            friendship.requester_id = v_requester_id
            or friendship.addressee_id = v_requester_id
          );

        select pg_catalog.count(*)::integer
        into v_addressee_friend_count
        from public.friendships friendship
        where friendship.status = 'accepted'
          and (
            friendship.requester_id = v_addressee_id
            or friendship.addressee_id = v_addressee_id
          );

        if v_addressee_friend_count >= (
          case when v_addressee_is_premium then 100 else 20 end
        ) then
          v_response_status := 403;
          v_error_code := 'FRIEND_LIMIT_REACHED';
          v_error_message := 'You have reached your friend limit.';
        elsif v_requester_friend_count >= (
          case when v_requester_is_premium then 100 else 20 end
        ) then
          v_response_status := 403;
          v_error_code := 'REQUESTER_LIMIT_REACHED';
          v_error_message := 'The requester has reached their friend limit.';
        else
          update public.friendships friendship
          set status = 'accepted',
              responded_at = pg_catalog.now()
          where friendship.id = p_friendship_id
            and friendship.addressee_id = p_actor_id
            and friendship.status = 'pending'
          returning friendship.* into v_friendship;

          if v_friendship.id is null or v_friendship.status <> 'accepted' then
            raise exception 'friend response did not persist accepted state';
          end if;

          select pg_catalog.jsonb_build_object(
            'status', 'accepted',
            'friendship', pg_catalog.jsonb_build_object(
              'id', friendship.id,
              'requester_id', friendship.requester_id,
              'addressee_id', friendship.addressee_id,
              'status', friendship.status,
              'requested_at', friendship.requested_at,
              'responded_at', friendship.responded_at,
              'requester', pg_catalog.jsonb_build_object(
                'id', requester.id,
                'username', requester.username,
                'display_name', requester.display_name,
                'avatar_url', requester.avatar_url,
                'location_text', requester.location_text,
                'is_online', coalesce(requester.is_online, false),
                'last_seen_at', requester.last_seen_at
              ),
              'addressee', pg_catalog.jsonb_build_object(
                'id', addressee.id,
                'username', addressee.username,
                'display_name', addressee.display_name,
                'avatar_url', addressee.avatar_url,
                'location_text', addressee.location_text,
                'is_online', coalesce(addressee.is_online, false),
                'last_seen_at', addressee.last_seen_at
              )
            )
          )
          into v_response_body
          from public.friendships friendship
          join public.profiles requester on requester.id = friendship.requester_id
          join public.profiles addressee on addressee.id = friendship.addressee_id
          where friendship.id = p_friendship_id;

          if v_response_body is null then
            raise exception 'accepted friendship projection is unavailable';
          end if;
          v_response_status := 200;
        end if;
      else
        delete from public.friendships friendship
        where friendship.id = p_friendship_id
          and friendship.addressee_id = p_actor_id
          and friendship.status = 'pending';

        if found then
          v_response_status := 200;
          v_response_body := pg_catalog.jsonb_build_object(
            'status', 'declined',
            'friendship', null
          );
        else
          raise exception 'friend response did not persist declined state';
        end if;
      end if;
    exception
      when others then
        v_response_status := 500;
        v_error_code := 'FRIEND_MUTATION_FAILED';
        v_error_message := 'Internal server error';
        v_response_body := null;
    end;
  end if;

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
      'friendship.responded',
      'friendship',
      p_friendship_id::text,
      pg_catalog.jsonb_build_object(
        'friendship_id', p_friendship_id,
        'requester_id', v_requester_id,
        'addressee_id', v_addressee_id,
        'actor_id', p_actor_id,
        'action', p_action
      )
    )
    on conflict (event_type, aggregate_id)
    where event_type = 'friendship.responded'
    do nothing;
  end if;

  return pg_catalog.jsonb_build_object(
    'response_status', v_response_status,
    'response_body', v_response_body,
    'retry_after_seconds', null,
    'replayed', false
  );
end;
$$;

revoke all on function public.respond_friend_request_idempotent(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.respond_friend_request_idempotent(
  uuid, uuid, text, text, text, text, text
) to service_role;
