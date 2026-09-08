-- Adult-only social access for existing and new accounts.
-- Preserve request-local birth dates; persist eligibility decisions only.

-- BEGIN AGE CORE
-- Private 18+ self-declaration. It records only the decision and policy
-- version, never a birth date or other age-verification evidence.
do $age_admission_baseline$
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'profiles must exist before account age admission';
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'public.profiles'::regclass
      and trigger.tgname = 'purge_account_age_admission_on_tombstone'
      and not trigger.tgisinternal
  ) then
    raise exception 'refusing to replace an existing account age-admission tombstone trigger';
  end if;
end;
$age_admission_baseline$;

create table public.account_age_admissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('adult', 'blocked')),
  decided_at timestamptz not null default pg_catalog.now(),
  policy_version text not null check (char_length(policy_version) between 1 and 64)
);

alter table public.account_age_admissions enable row level security;
revoke all on public.account_age_admissions from public, anon, authenticated, service_role;

create function public.read_account_age_admission_v1(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_decided_at timestamptz;
begin
  select admission.status, admission.decided_at
  into v_status, v_decided_at
  from public.account_age_admissions admission
  join public.profiles profile
    on profile.id = admission.user_id and profile.deleted_at is null
  where admission.user_id = p_user_id;

  return jsonb_build_object(
    'status', coalesce(v_status, 'pending'),
    'decided_at', case when v_decided_at is null then null else to_char(v_decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  );
end;
$$;

create function public.record_account_age_admission_v1(
  p_user_id uuid,
  p_is_adult boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
begin
  if p_user_id is null or p_is_adult is null then
    raise exception using errcode = '22023', message = 'invalid age admission declaration';
  end if;
  select profile.deleted_at into v_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for share;
  if not found or v_deleted_at is not null then
    raise exception using errcode = 'P0002', message = 'account not found';
  end if;

  insert into public.account_age_admissions(user_id, status, policy_version)
  values (
    p_user_id,
    case when p_is_adult then 'adult' else 'blocked' end,
    '18plus-self-declaration-v1'
  )
  on conflict (user_id) do nothing;

  return public.read_account_age_admission_v1(p_user_id);
end;
$$;

create function public.require_adult_social_admission_v1(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select admission.status into v_status
  from public.account_age_admissions admission
  join public.profiles profile
    on profile.id = admission.user_id and profile.deleted_at is null
  where admission.user_id = p_user_id;

  if v_status = 'adult' then
    return;
  end if;
  if v_status = 'blocked' then
    raise exception using errcode = 'P0001', message = 'AGE_NOT_ELIGIBLE';
  end if;
  raise exception using errcode = 'P0001', message = 'AGE_ADMISSION_REQUIRED';
end;
$$;

revoke all on function public.read_account_age_admission_v1(uuid),
  public.record_account_age_admission_v1(uuid, boolean),
  public.require_adult_social_admission_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.read_account_age_admission_v1(uuid),
  public.record_account_age_admission_v1(uuid, boolean),
  public.require_adult_social_admission_v1(uuid)
  to service_role;

create function public.purge_account_age_admission_on_profile_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.account_age_admissions where user_id = new.id;
  return new;
end;
$$;

revoke all on function public.purge_account_age_admission_on_profile_tombstone()
  from public, anon, authenticated, service_role;

create trigger purge_account_age_admission_on_tombstone
before update of deleted_at on public.profiles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.purge_account_age_admission_on_profile_tombstone();
-- END AGE CORE

-- BEGIN AGE CANONICAL
-- Private migration-17 fragment. Assemble after account_age_admissions exists.
create function public.is_adult_social_admitted_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1 from public.account_age_admissions admission
    join public.profiles profile on profile.id = admission.user_id
    where admission.user_id = p_user_id and admission.status = 'adult' and profile.deleted_at is null
  );
$$;

create function public.can_users_interact_v1(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_a is not null and p_user_b is not null and p_user_a <> p_user_b
    and public.is_adult_social_admitted_v1(p_user_a)
    and public.is_adult_social_admitted_v1(p_user_b)
    and not exists (select 1 from public.user_blocks block where (block.blocker_id=p_user_a and block.blocked_id=p_user_b) or (block.blocker_id=p_user_b and block.blocked_id=p_user_a));
$$;

create function public.filter_adult_social_peers_v1(p_user_id uuid, p_peer_ids uuid[])
returns uuid[] language sql stable security definer set search_path = '' as $$
  with candidates as (
    select distinct peer_id
    from unnest(coalesce(p_peer_ids, '{}'::uuid[])) peer_id
    where peer_id is not null
    order by peer_id
    limit 101
  )
  select coalesce(array_agg(peer_id order by peer_id), '{}'::uuid[])
  from candidates where public.can_users_interact_v1(p_user_id, peer_id);
$$;

revoke all on function public.is_adult_social_admitted_v1(uuid), public.can_users_interact_v1(uuid,uuid), public.filter_adult_social_peers_v1(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.is_adult_social_admitted_v1(uuid), public.can_users_interact_v1(uuid,uuid), public.filter_adult_social_peers_v1(uuid,uuid[]) to service_role;
-- END AGE CANONICAL

-- BEGIN AGE SAFETY_ACTIONS
CREATE OR REPLACE FUNCTION public.block_user_idempotent(p_actor_id uuid, p_blocked_id uuid, p_operation text, p_idempotency_key text, p_request_hash text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
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
      v_bucket_denied_retry_after_seconds := least(
        v_rate_window_seconds,
        greatest(
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
      'refunded', coalesce((v_block ->> 'refunded')::boolean, false),
      'balance', case
        when coalesce((v_block ->> 'refunded')::boolean, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.remove_friendship_idempotent(p_actor_id uuid, p_friendship_id uuid, p_operation text, p_idempotency_key text, p_request_hash text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claimed integer := 0;
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_response_status integer;
  v_response_body jsonb;
  v_safe_request_id text;
  v_removal jsonb;
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
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
$function$;
-- END AGE SAFETY_ACTIONS

-- BEGIN AGE READERS
-- Private migration-17 fragment. Assemble after account_age_admissions and
-- the service-only age admission helpers exist. The captured legacy ACLs are
-- deliberately preserved by CREATE OR REPLACE FUNCTION.

-- Captured get_threads(uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.get_threads(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threads JSONB;
  v_total_unread INT;
BEGIN
  PERFORM public.require_adult_social_admission_v1(p_user_id);
  WITH user_threads AS (
    SELECT t.*,
      to_jsonb(p1.*) AS participant_1,
      to_jsonb(p2.*) AS participant_2,
      COALESCE((
        SELECT count(*) FROM dm_messages m
        WHERE m.thread_id = t.id AND m.sender_id != p_user_id AND m.is_read = false AND m.is_deleted = false
      ), 0)::int AS unread_count
    FROM dm_threads t
    JOIN profiles p1 ON p1.id = t.participant_1_id
    JOIN profiles p2 ON p2.id = t.participant_2_id
    WHERE (t.participant_1_id = p_user_id OR t.participant_2_id = p_user_id)
      AND public.can_users_interact_v1(
        p_user_id,
        CASE WHEN t.participant_1_id = p_user_id THEN t.participant_2_id ELSE t.participant_1_id END
      )
    ORDER BY t.last_message_at DESC NULLS LAST
  )
  SELECT COALESCE(jsonb_agg(
    to_jsonb(ut.*) - 'participant_1' - 'participant_2'
    || jsonb_build_object(
      'type', 'dm',
      'participant_1', ut.participant_1,
      'participant_2', ut.participant_2,
      'unread_count', ut.unread_count
    )
  ), '[]'::jsonb),
  COALESCE(sum(ut.unread_count), 0)::int
  INTO v_threads, v_total_unread
  FROM user_threads ut;

  RETURN jsonb_build_object(
    'threads', v_threads,
    'total_unread', v_total_unread
  );
END;
$function$;

-- Captured get_friends(uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.get_friends(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_friends JSONB;
  v_requests JSONB;
  v_sent JSONB;
BEGIN
  PERFORM public.require_adult_social_admission_v1(p_user_id);
  -- Friends (accepted) with other profile + friendship_id + roles
  WITH friend_rows AS (
    SELECT f.id AS friendship_id,
      CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
      AND public.can_users_interact_v1(
        p_user_id,
        CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END
      )
  )
  SELECT COALESCE(jsonb_agg(
    to_jsonb(p.*) || jsonb_build_object(
      'friendship_id', fr.friendship_id,
      'roles', COALESCE((SELECT jsonb_agg(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = fr.friend_id), '["user"]'::jsonb)
    )
  ), '[]'::jsonb) INTO v_friends
  FROM friend_rows fr
  JOIN profiles p ON p.id = fr.friend_id;

  -- Pending requests (where user is addressee) with requester profile
  SELECT COALESCE(jsonb_agg(
    to_jsonb(f.*) || jsonb_build_object('requester', to_jsonb(pr.*))
  ), '[]'::jsonb) INTO v_requests
  FROM friendships f
  JOIN profiles pr ON pr.id = f.requester_id
  WHERE f.addressee_id = p_user_id AND f.status = 'pending'
    AND public.can_users_interact_v1(p_user_id, f.requester_id);

  -- Sent request user IDs
  SELECT COALESCE(jsonb_agg(f.addressee_id), '[]'::jsonb) INTO v_sent
  FROM friendships f
  WHERE f.requester_id = p_user_id AND f.status = 'pending'
    AND public.can_users_interact_v1(p_user_id, f.addressee_id);

  RETURN jsonb_build_object(
    'friends', v_friends,
    'requests', v_requests,
    'sentRequestUserIds', v_sent
  );
END;
$function$;

-- Captured get_user_profile(uuid,uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.get_user_profile(p_target_id uuid, p_viewer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  v_profile JSONB;
  v_roles JSONB;
  v_photos JSONB;
  v_interests JSONB;
  v_stats JSONB;
  v_friendship JSONB;
BEGIN
  PERFORM public.require_adult_social_admission_v1(p_viewer_id);
  IF p_viewer_id <> p_target_id
     AND NOT public.can_users_interact_v1(p_viewer_id, p_target_id) THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Profile (public fields)
  SELECT to_jsonb(p.*) INTO v_profile
  FROM profiles p WHERE p.id = p_target_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Roles
  SELECT COALESCE(jsonb_agg(r.name), '["user"]'::jsonb) INTO v_roles
  FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_target_id;

  v_profile = v_profile || jsonb_build_object('roles', v_roles);

  -- Photos (filter private if viewer != target)
  IF p_viewer_id = p_target_id THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(pp.*) ORDER BY pp.display_order), '[]'::jsonb) INTO v_photos
    FROM profile_photos pp WHERE pp.user_id = p_target_id;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(pp.*) ORDER BY pp.display_order), '[]'::jsonb) INTO v_photos
    FROM profile_photos pp WHERE pp.user_id = p_target_id AND pp.is_private = false;
  END IF;

  -- Interests with tags
  SELECT COALESCE(jsonb_agg(
    to_jsonb(pi.*) || jsonb_build_object('tag', to_jsonb(it.*))
    ORDER BY pi.created_at
  ), '[]'::jsonb) INTO v_interests
  FROM profile_interests pi
  JOIN interest_tags it ON it.id = pi.tag_id
  WHERE pi.user_id = p_target_id;

  -- Stats
  SELECT jsonb_build_object(
    'photos_count', (SELECT count(*) FROM profile_photos WHERE user_id = p_target_id),
    'friends_count', (SELECT count(*) FROM friendships WHERE status = 'accepted'
      AND (requester_id = p_target_id OR addressee_id = p_target_id))
  ) INTO v_stats;

  -- Friendship between viewer and target
  SELECT to_jsonb(f.*) INTO v_friendship
  FROM friendships f
  WHERE (f.requester_id = p_viewer_id AND f.addressee_id = p_target_id)
     OR (f.requester_id = p_target_id AND f.addressee_id = p_viewer_id)
  LIMIT 1;

  result = jsonb_build_object(
    'profile', v_profile,
    'photos', v_photos,
    'interests', v_interests,
    'stats', v_stats,
    'friendship', COALESCE(v_friendship, 'null'::jsonb)
  );

  RETURN result;
END;
$function$;

-- Captured accept_invite_link_for_user(uuid,uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.accept_invite_link_for_user(p_user_id uuid, p_inviter_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_friendship_id uuid;
  v_current_status public.friendship_status;
begin
  PERFORM public.require_adult_social_admission_v1(p_user_id);
  if p_user_id = p_inviter_id then
    return;
  end if;
  if not public.can_users_interact_v1(p_user_id, p_inviter_id) then
    return;
  end if;

  select friendship.id, friendship.status
  into v_friendship_id, v_current_status
  from public.friendships friendship
  where (friendship.requester_id = p_inviter_id and friendship.addressee_id = p_user_id)
     or (friendship.requester_id = p_user_id and friendship.addressee_id = p_inviter_id)
  limit 1;

  if v_friendship_id is not null then
    if v_current_status = 'accepted' then
      return;
    end if;

    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = v_friendship_id;
  else
    insert into public.friendships (
      requester_id,
      addressee_id,
      status,
      requested_at,
      responded_at
    ) values (
      p_inviter_id,
      p_user_id,
      'accepted',
      now(),
      now()
    );
  end if;
end;
$function$;

-- Captured get_shared_groups(uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
-- Deprecated compatibility entry point. It must not expose group membership.
CREATE OR REPLACE FUNCTION public.get_shared_groups(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH admission AS MATERIALIZED (
    SELECT public.require_adult_social_admission_v1(p_user_id) AS admission_guard
  )
  SELECT '[]'::jsonb
  FROM admission
  WHERE admission.admission_guard::text = '';
$function$;

-- Captured app_private.can_access_dm_thread(text); owner postgres; ACL {postgres=X/postgres,authenticated=X/postgres}.
CREATE OR REPLACE FUNCTION app_private.can_access_dm_thread(p_thread_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.dm_threads thread
    join public.profiles participant_1 on participant_1.id = thread.participant_1_id
    join public.profiles participant_2 on participant_2.id = thread.participant_2_id
    where thread.id::text = p_thread_id
      and (select auth.uid()) in (thread.participant_1_id, thread.participant_2_id)
      and participant_1.deleted_at is null
      and participant_2.deleted_at is null
      and public.is_adult_social_admitted_v1(thread.participant_1_id)
      and public.is_adult_social_admitted_v1(thread.participant_2_id)
      and not exists (
        select 1
        from public.user_blocks block
        where (block.blocker_id = thread.participant_1_id and block.blocked_id = thread.participant_2_id)
           or (block.blocker_id = thread.participant_2_id and block.blocked_id = thread.participant_1_id)
      )
  );
$function$;

-- Captured search_users_for_user(uuid,text,uuid[],uuid[],integer); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.search_users_for_user(p_user_id uuid, q text, tag_ids uuid[] DEFAULT '{}'::uuid[], nearby_ids uuid[] DEFAULT '{}'::uuid[], result_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, is_online boolean, is_nearby boolean, matched_tags jsonb, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with input as (
    select
      left(coalesce(q, ''), 100) as search_query,
      (coalesce(tag_ids, '{}'::uuid[]))[1:20] as selected_tags,
      (coalesce(nearby_ids, '{}'::uuid[]))[1:500] as nearby_users
  ),
  candidates as (
    select
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.is_online,
      input.search_query,
      input.selected_tags,
      input.nearby_users
    from public.profiles profile
    cross join input
    where profile.deleted_at is null
      and profile.id <> p_user_id
      and public.can_users_interact_v1(p_user_id, profile.id)
      and not exists (
        select 1
        from public.user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = profile.id)
           or (block.blocker_id = profile.id and block.blocked_id = p_user_id)
      )
      and (
        input.search_query = ''
        or profile.username ilike input.search_query || '%'
        or profile.display_name ilike '%' || input.search_query || '%'
        or extensions.similarity(profile.display_name, input.search_query) > 0.2
        or extensions.similarity(profile.username, input.search_query) > 0.2
      )
      and (
        coalesce(array_length(input.selected_tags, 1), 0) = 0
        or (
          select count(distinct interest.tag_id) = array_length(input.selected_tags, 1)
          from public.profile_interests interest
          where interest.user_id = profile.id
            and interest.tag_id = any(input.selected_tags)
        )
      )
  )
  select
    candidate.id,
    candidate.username,
    candidate.display_name,
    candidate.avatar_url,
    candidate.is_online,
    candidate.id = any(candidate.nearby_users) as is_nearby,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tag.id,
        'name', tag.name,
        'icon', tag.icon
      ))
      from public.profile_interests interest
      join public.interest_tags tag on tag.id = interest.tag_id
      where interest.user_id = candidate.id
        and interest.tag_id = any(candidate.selected_tags)
    ), '[]'::jsonb) as matched_tags,
    (
      case when candidate.id = any(candidate.nearby_users) then 2.0 else 0.0 end
      + greatest(
          extensions.similarity(coalesce(candidate.display_name, ''), candidate.search_query),
          extensions.similarity(coalesce(candidate.username, ''), candidate.search_query)
        )
      + case when candidate.username ilike candidate.search_query || '%' then 0.5 else 0.0 end
    )::real as rank
  from candidates candidate
  order by rank desc, candidate.is_online desc nulls last, candidate.display_name asc
  -- The scalar admission guard is evaluated to determine the bounded LIMIT even
  -- when no profile is a candidate, so pending and blocked actors fail closed.
  limit least(greatest(coalesce(result_limit, 20), 1), 50)
    + (select length(public.require_adult_social_admission_v1(p_user_id)::text) * 0);
$function$;
-- END AGE READERS

-- BEGIN AGE MESSAGING
-- Private age-admission messaging fragment.
-- Derived from the exact captured legacy definitions in age-admission-current-definitions.
-- Root assembles this beside the remaining legacy RPC fragment.
-- Requires public.require_adult_social_admission_v1(uuid) and public.can_users_interact_v1(uuid, uuid).

-- Captured send_message_transactional(uuid,uuid,uuid,text,text,text,text,uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.send_message_transactional(p_thread_id uuid, p_sender_id uuid, p_client_id uuid, p_content text, p_message_type text DEFAULT 'text'::text, p_media_url text DEFAULT NULL::text, p_media_thumbnail_url text DEFAULT NULL::text, p_reply_to_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_thread public.dm_threads%rowtype;
  v_existing public.dm_messages%rowtype;
  v_peer_id uuid;
  v_sequence bigint;
  v_message_id uuid;
  v_message jsonb;
  v_main_path text;
  v_thumbnail_path text;
  v_claimed_message_id uuid;
  v_claim_cleanup_fenced_at timestamptz;
  v_row_count integer;
  v_deduplicated boolean := false;
BEGIN
  perform public.require_adult_social_admission_v1(p_sender_id);
  select thread.*
  into v_thread
  from public.dm_threads thread
  where thread.id = p_thread_id
    and p_sender_id in (thread.participant_1_id, thread.participant_2_id)
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'THREAD_NOT_FOUND');
  end if;

  v_peer_id := case
    when v_thread.participant_1_id = p_sender_id then v_thread.participant_2_id
    else v_thread.participant_1_id
  end;

  if not public.can_users_interact_v1(p_sender_id, v_peer_id) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;

  if exists (
    select 1
    from public.user_blocks block
    where (block.blocker_id = p_sender_id and block.blocked_id = v_peer_id)
       or (block.blocker_id = v_peer_id and block.blocked_id = p_sender_id)
  ) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;

  if exists (
    select 1
    from public.profiles profile
    where profile.id in (p_sender_id, v_peer_id)
      and profile.deleted_at is not null
  ) then
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_DELETED');
  end if;

  if p_reply_to_id is not null and not exists (
    select 1
    from public.dm_messages reply
    where reply.id = p_reply_to_id
      and reply.thread_id = p_thread_id
      and reply.is_deleted = false
  ) then
    return pg_catalog.jsonb_build_object('error', 'REPLY_TARGET_NOT_FOUND');
  end if;

  select message.*
  into v_existing
  from public.dm_messages message
  where message.thread_id = p_thread_id
    and message.client_id = p_client_id
  for update;

  if found then
    if v_existing.sender_id is distinct from p_sender_id
       or v_existing.content is distinct from p_content
       or v_existing.message_type::text is distinct from p_message_type
       or v_existing.media_url is distinct from p_media_url
       or v_existing.media_thumbnail_url is distinct from p_media_thumbnail_url
       or v_existing.reply_to_id is distinct from p_reply_to_id then
      return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
    end if;
    v_message_id := v_existing.id;
    v_deduplicated := true;
  else
    if p_message_type not in ('text', 'image')
       or (p_message_type = 'text' and (p_media_url is not null or p_media_thumbnail_url is not null))
       or (p_message_type = 'image' and p_media_url is null)
       or (p_media_url is null and p_media_thumbnail_url is not null) then
      return pg_catalog.jsonb_build_object('error', 'INVALID_MEDIA');
    end if;

    if p_message_type = 'image' then
      v_main_path := app_private.dm_media_path_from_canonical_url(
        p_media_url,
        p_sender_id,
        false
      );
      v_thumbnail_path := case when p_media_thumbnail_url is null then null else
        app_private.dm_media_path_from_canonical_url(
          p_media_thumbnail_url,
          p_sender_id,
          true
        )
      end;

      if v_main_path is null
         or (p_media_thumbnail_url is not null and v_thumbnail_path is null)
         or (
           v_thumbnail_path is not null
           and (
             pg_catalog.split_part(p_media_url, '/storage/v1/object/public/media/', 1)
               is distinct from
             pg_catalog.split_part(p_media_thumbnail_url, '/storage/v1/object/public/media/', 1)
             or pg_catalog.regexp_replace(
               v_main_path,
               '[.](jpg|png|webp|gif)$',
               ''
             ) is distinct from pg_catalog.regexp_replace(
               v_thumbnail_path,
               '_thumb[.](jpg|png|webp|gif)$',
               ''
             )
           )
         ) then
        return pg_catalog.jsonb_build_object('error', 'INVALID_MEDIA');
      end if;

      perform generation.path
      from public.dm_media_path_generations generation
      where generation.bucket_id = 'media'
        and generation.path in (v_main_path, v_thumbnail_path)
      order by generation.path
      for update;

      select generation.claimed_message_id, generation.cleanup_fenced_at
      into v_claimed_message_id, v_claim_cleanup_fenced_at
      from public.dm_media_path_generations generation
      join storage.objects object
        on object.bucket_id = generation.bucket_id
       and object.name = generation.path
       and object.id is not distinct from generation.object_id
       and object.version is not distinct from generation.object_version
      where generation.bucket_id = 'media'
        and generation.path = v_main_path
        and generation.object_id is not null
        and app_private.dm_media_storage_object_digest(
          generation.bucket_id,
          generation.path
        ) = generation.object_digest
      for key share of object;
      if not found then
        return pg_catalog.jsonb_build_object('error', 'INVALID_MEDIA');
      end if;
      if v_claimed_message_id is not null or v_claim_cleanup_fenced_at is not null then
        return pg_catalog.jsonb_build_object('error', 'MEDIA_ALREADY_CLAIMED');
      end if;

      if v_thumbnail_path is not null then
        select generation.claimed_message_id, generation.cleanup_fenced_at
        into v_claimed_message_id, v_claim_cleanup_fenced_at
        from public.dm_media_path_generations generation
        join storage.objects object
          on object.bucket_id = generation.bucket_id
         and object.name = generation.path
         and object.id is not distinct from generation.object_id
         and object.version is not distinct from generation.object_version
        where generation.bucket_id = 'media'
          and generation.path = v_thumbnail_path
          and generation.object_id is not null
          and app_private.dm_media_storage_object_digest(
            generation.bucket_id,
            generation.path
          ) = generation.object_digest
        for key share of object;
        if not found then
          return pg_catalog.jsonb_build_object('error', 'INVALID_MEDIA');
        end if;
        if v_claimed_message_id is not null or v_claim_cleanup_fenced_at is not null then
          return pg_catalog.jsonb_build_object('error', 'MEDIA_ALREADY_CLAIMED');
        end if;
      end if;
    end if;

    update public.dm_threads thread
    set next_message_sequence = thread.next_message_sequence + 1
    where thread.id = p_thread_id
    returning thread.next_message_sequence into v_sequence;

    v_message_id := gen_random_uuid();
    insert into public.dm_messages (
      id,
      thread_id,
      sender_id,
      client_id,
      sequence,
      content,
      message_type,
      media_url,
      media_thumbnail_url,
      reply_to_id
    )
    values (
      v_message_id,
      p_thread_id,
      p_sender_id,
      p_client_id,
      v_sequence,
      p_content,
      p_message_type::public.message_type,
      p_media_url,
      p_media_thumbnail_url,
      p_reply_to_id
    );

    if v_main_path is not null then
      insert into public.dm_media_claims (
        message_id,
        thread_id,
        actor_id,
        client_id,
        main_path,
        thumbnail_path
      )
      values (
        v_message_id,
        p_thread_id,
        p_sender_id,
        p_client_id,
        v_main_path,
        v_thumbnail_path
      );

      update public.dm_media_path_generations generation
      set claimed_message_id = v_message_id,
          claim_role = 'main'
      where generation.bucket_id = 'media'
        and generation.path = v_main_path
        and generation.claimed_message_id is null
        and generation.cleanup_fenced_at is null;
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'DM main media generation claim was lost';
      end if;

      if v_thumbnail_path is not null then
        update public.dm_media_path_generations generation
        set claimed_message_id = v_message_id,
            claim_role = 'thumbnail'
        where generation.bucket_id = 'media'
          and generation.path = v_thumbnail_path
          and generation.claimed_message_id is null
          and generation.cleanup_fenced_at is null;
        get diagnostics v_row_count = row_count;
        if v_row_count <> 1 then
          raise exception 'DM thumbnail media generation claim was lost';
        end if;
      end if;
    end if;

    update public.dm_thread_members member
    set last_read_sequence = greatest(member.last_read_sequence, v_sequence),
        updated_at = pg_catalog.now()
    where member.thread_id = p_thread_id
      and member.user_id = p_sender_id;

    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'message.changed',
      'dm_thread',
      p_thread_id::text,
      pg_catalog.jsonb_build_object(
        'thread_id', p_thread_id,
        'message_id', v_message_id,
        'sender_id', p_sender_id,
        'recipient_id', v_peer_id,
        'sequence', v_sequence,
        'action', 'sent'
      )
    );
  end if;

  select pg_catalog.to_jsonb(message.*) || pg_catalog.jsonb_build_object(
    'sender', pg_catalog.to_jsonb(sender.*),
    'reply_to', case when message.reply_to_id is not null then (
      select pg_catalog.jsonb_build_object(
        'id', reply.id,
        'sender_id', reply.sender_id,
        'content', reply.content
      )
      from public.dm_messages reply
      where reply.id = message.reply_to_id
    ) else null end
  )
  into v_message
  from public.dm_messages message
  join public.profiles sender on sender.id = message.sender_id
  where message.id = v_message_id;

  return pg_catalog.jsonb_build_object(
    'message', v_message,
    'deduplicated', v_deduplicated
  );
end;
$function$;

-- Captured mutate_dm_message_idempotent(uuid,uuid,uuid,text,text,text,text,text,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.mutate_dm_message_idempotent(p_actor_id uuid, p_thread_id uuid, p_message_id uuid, p_action text, p_content text, p_operation text, p_idempotency_key text, p_request_hash text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stored_hash text;
  v_stored_status integer;
  v_stored_body jsonb;
  v_response_status integer;
  v_response_body jsonb;
  v_safe_request_id text;
  v_thread public.dm_threads%rowtype;
  v_message public.dm_messages%rowtype;
  v_media_url text;
  v_media_thumbnail_url text;
  v_media_origin text;
  v_media_path text;
  v_media_object_id uuid;
  v_media_object_version text;
  v_media_object_digest text;
  v_thumbnail_origin text;
  v_thumbnail_path text;
  v_thumbnail_object_id uuid;
  v_thumbnail_object_version text;
  v_thumbnail_object_digest text;
  v_cleanup_id uuid;
  v_cleanup_event_id uuid;
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_action not in ('edit', 'delete')
     or p_operation is distinct from (case
       when p_action = 'edit' then 'dm_message:edit'
       else 'dm_message:delete'
     end)
     or p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) < 16
     or pg_catalog.char_length(p_idempotency_key) > 128
     or p_idempotency_key not similar to '[A-Za-z0-9._:-]+'
     or p_request_hash not similar to '[0-9a-f]{64}'
     or (
       p_action = 'edit'
       and (
         p_content is null
         or p_content is distinct from pg_catalog.btrim(p_content)
         or pg_catalog.char_length(p_content) not between 1 and 4000
       )
     )
     or (p_action = 'delete' and p_content is not null) then
    return pg_catalog.jsonb_build_object(
      'response_status', 400,
      'response_body', pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Invalid message mutation request',
        'message', 'Invalid message mutation request',
        'code', 'VALIDATION_ERROR',
        'request_id', null
      ),
      'replayed', false
    );
  end if;

  v_safe_request_id := case
    when p_request_id similar to '[A-Za-z0-9._:-]{1,128}' then p_request_id
    else null
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':' || p_operation || ':' || p_idempotency_key,
      0
    )
  );

  delete from public.idempotency_records record
  where record.actor_id = p_actor_id
    and record.operation = p_operation
    and record.key = p_idempotency_key
    and record.expires_at <= pg_catalog.clock_timestamp();

  select record.request_hash, record.response_status, record.response_body
  into v_stored_hash, v_stored_status, v_stored_body
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
        'replayed', false
      );
    end if;
    if v_stored_status is null or v_stored_body is null then
      return pg_catalog.jsonb_build_object(
        'response_status', 503,
        'response_body', pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Message mutation service temporarily unavailable',
          'message', 'Message mutation service temporarily unavailable',
          'code', 'MESSAGE_MUTATION_IDEMPOTENCY_UNAVAILABLE',
          'request_id', v_safe_request_id
        ),
        'replayed', false
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'response_status', v_stored_status,
      'response_body', v_stored_body,
      'replayed', true
    );
  end if;

  <<mutation>>
  begin
    perform profile.id
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.deleted_at is null
    for share;
    if not found then
      v_response_status := 403;
      v_response_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Account is not active',
        'message', 'Account is not active',
        'code', 'FORBIDDEN',
        'request_id', v_safe_request_id
      );
      exit mutation;
    end if;

    select thread.*
    into v_thread
    from public.dm_threads thread
    where thread.id = p_thread_id
      and p_actor_id in (thread.participant_1_id, thread.participant_2_id)
    for key share;
    if not found then
      v_response_status := 404;
      v_response_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Thread not found',
        'message', 'Thread not found',
        'code', 'THREAD_NOT_FOUND',
        'request_id', v_safe_request_id
      );
      exit mutation;
    end if;

    select message.*
    into v_message
    from public.dm_messages message
    where message.id = p_message_id
      and message.thread_id = p_thread_id
    for update;
    if not found then
      v_response_status := 404;
      v_response_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', 'Message not found',
        'message', 'Message not found',
        'code', 'MESSAGE_NOT_FOUND',
        'request_id', v_safe_request_id
      );
      exit mutation;
    end if;

    if v_message.sender_id is distinct from p_actor_id then
      v_response_status := 403;
      v_response_body := pg_catalog.jsonb_build_object(
        'version', 'v1',
        'error', case when p_action = 'edit'
          then 'Cannot edit others'' messages'
          else 'Cannot delete others'' messages'
        end,
        'message', case when p_action = 'edit'
          then 'Cannot edit others'' messages'
          else 'Cannot delete others'' messages'
        end,
        'code', 'FORBIDDEN',
        'request_id', v_safe_request_id
      );
      exit mutation;
    end if;

    if p_action = 'edit' and not public.can_users_interact_v1(p_actor_id, case when v_thread.participant_1_id = p_actor_id then v_thread.participant_2_id else v_thread.participant_1_id end) then
      v_response_status := 403;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Cannot edit this message', 'message', 'Cannot edit this message', 'code', 'FORBIDDEN', 'request_id', v_safe_request_id);
      exit mutation;
    end if;

    if p_action = 'edit' then
      if v_message.is_deleted then
        v_response_status := 409;
        v_response_body := pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Cannot edit deleted message',
          'message', 'Cannot edit deleted message',
          'code', 'MESSAGE_EDIT_FAILED',
          'request_id', v_safe_request_id
        );
        exit mutation;
      end if;
      if v_message.created_at + interval '15 minutes' < pg_catalog.clock_timestamp() then
        v_response_status := 400;
        v_response_body := pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Edit window expired (15 minutes)',
          'message', 'Edit window expired (15 minutes)',
          'code', 'MESSAGE_EDIT_WINDOW_EXPIRED',
          'request_id', v_safe_request_id
        );
        exit mutation;
      end if;

      update public.dm_messages message
      set content = p_content,
          is_edited = true
      where message.id = p_message_id
        and message.thread_id = p_thread_id
        and message.sender_id = p_actor_id
      returning message.* into v_message;
    elsif not v_message.is_deleted then
      v_media_url := v_message.media_url;
      v_media_thumbnail_url := v_message.media_thumbnail_url;

      if v_media_url is null and v_media_thumbnail_url is not null then
        v_response_status := 503;
        v_response_body := pg_catalog.jsonb_build_object(
          'version', 'v1',
          'error', 'Message media cleanup unavailable',
          'message', 'Message media cleanup unavailable',
          'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
          'request_id', v_safe_request_id
        );
        exit mutation;
      end if;

      if v_media_url is not null then
        v_media_origin := pg_catalog.split_part(
          v_media_url,
          '/storage/v1/object/public/media/',
          1
        );
        v_media_path := pg_catalog.split_part(
          v_media_url,
          '/storage/v1/object/public/media/',
          2
        );
        if v_media_url is distinct from (
             v_media_origin || '/storage/v1/object/public/media/' || v_media_path
           )
           or (
             v_media_origin not similar to 'http://[a-z0-9.-]+'
             and v_media_origin not similar to 'https://[a-z0-9.-]+'
             and v_media_origin not similar to 'http://[a-z0-9.-]+:[0-9]{1,5}'
             and v_media_origin not similar to 'https://[a-z0-9.-]+:[0-9]{1,5}'
           )
           or v_media_path not similar to (
             p_actor_id::text
             || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)'
           ) then
          v_response_status := 503;
          v_response_body := pg_catalog.jsonb_build_object(
            'version', 'v1',
            'error', 'Message media cleanup unavailable',
            'message', 'Message media cleanup unavailable',
            'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
            'request_id', v_safe_request_id
          );
          exit mutation;
        end if;

        select generation.object_id,
               generation.object_version,
               generation.object_digest
        into v_media_object_id,
             v_media_object_version,
             v_media_object_digest
        from public.dm_media_path_generations generation
        where generation.bucket_id = 'media'
          and generation.path = v_media_path
        for share;
        if not found then
          v_response_status := 503;
          v_response_body := pg_catalog.jsonb_build_object(
            'version', 'v1',
            'error', 'Message media cleanup unavailable',
            'message', 'Message media cleanup unavailable',
            'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
            'request_id', v_safe_request_id
          );
          exit mutation;
        end if;

        perform object.id
        from storage.objects object
        where object.bucket_id = 'media'
          and object.name = v_media_path
        for share;
        if found and exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'media'
            and object.name = v_media_path
            and (
              object.id is distinct from v_media_object_id
              or object.version is distinct from v_media_object_version
              or app_private.dm_media_storage_object_digest(
                'media',
                v_media_path
              ) is distinct from v_media_object_digest
            )
        ) then
          v_response_status := 503;
          v_response_body := pg_catalog.jsonb_build_object(
            'version', 'v1',
            'error', 'Message media cleanup unavailable',
            'message', 'Message media cleanup unavailable',
            'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
            'request_id', v_safe_request_id
          );
          exit mutation;
        end if;

        if v_media_thumbnail_url is not null then
          v_thumbnail_origin := pg_catalog.split_part(
            v_media_thumbnail_url,
            '/storage/v1/object/public/media/',
            1
          );
          v_thumbnail_path := pg_catalog.split_part(
            v_media_thumbnail_url,
            '/storage/v1/object/public/media/',
            2
          );
          if v_media_thumbnail_url is distinct from (
               v_thumbnail_origin || '/storage/v1/object/public/media/' || v_thumbnail_path
             )
             or v_thumbnail_origin is distinct from v_media_origin
             or v_thumbnail_path not similar to (
               p_actor_id::text
               || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_thumb[.](jpg|png|webp|gif)'
             )
             or pg_catalog.regexp_replace(
               v_media_path,
               '[.](jpg|png|webp|gif)$',
               ''
             ) is distinct from pg_catalog.regexp_replace(
               v_thumbnail_path,
               '_thumb[.](jpg|png|webp|gif)$',
               ''
             ) then
            v_response_status := 503;
            v_response_body := pg_catalog.jsonb_build_object(
              'version', 'v1',
              'error', 'Message media cleanup unavailable',
              'message', 'Message media cleanup unavailable',
              'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
              'request_id', v_safe_request_id
            );
            exit mutation;
          end if;

          select generation.object_id,
                 generation.object_version,
                 generation.object_digest
          into v_thumbnail_object_id,
               v_thumbnail_object_version,
               v_thumbnail_object_digest
          from public.dm_media_path_generations generation
          where generation.bucket_id = 'media'
            and generation.path = v_thumbnail_path
          for share;
          if not found then
            v_response_status := 503;
            v_response_body := pg_catalog.jsonb_build_object(
              'version', 'v1',
              'error', 'Message media cleanup unavailable',
              'message', 'Message media cleanup unavailable',
              'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
              'request_id', v_safe_request_id
            );
            exit mutation;
          end if;

          perform object.id
          from storage.objects object
          where object.bucket_id = 'media'
            and object.name = v_thumbnail_path
          for share;
          if found and exists (
            select 1
            from storage.objects object
            where object.bucket_id = 'media'
              and object.name = v_thumbnail_path
              and (
                object.id is distinct from v_thumbnail_object_id
                or object.version is distinct from v_thumbnail_object_version
                or app_private.dm_media_storage_object_digest(
                  'media',
                  v_thumbnail_path
                ) is distinct from v_thumbnail_object_digest
              )
          ) then
            v_response_status := 503;
            v_response_body := pg_catalog.jsonb_build_object(
              'version', 'v1',
              'error', 'Message media cleanup unavailable',
              'message', 'Message media cleanup unavailable',
              'code', 'MESSAGE_MEDIA_CLEANUP_UNAVAILABLE',
              'request_id', v_safe_request_id
            );
            exit mutation;
          end if;
        end if;
      end if;

      update public.dm_messages message
      set is_deleted = true,
          content = null,
          media_url = null,
          media_thumbnail_url = null
      where message.id = p_message_id
        and message.thread_id = p_thread_id
        and message.sender_id = p_actor_id
      returning message.* into v_message;

      if v_media_path is not null then
        v_cleanup_id := gen_random_uuid();
        v_cleanup_event_id := gen_random_uuid();
        insert into public.outbox_events (
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload
        )
        values (
          v_cleanup_event_id,
          'dm.media_cleanup',
          'dm_message',
          p_message_id::text,
          pg_catalog.jsonb_build_object(
            'cleanup_id', v_cleanup_id,
            'message_id', p_message_id,
            'thread_id', p_thread_id,
            'actor_id', p_actor_id,
            'sequence', v_message.sequence,
            'main_path', v_media_path,
            'main_object_digest', v_media_object_digest,
            'thumbnail_path', v_thumbnail_path,
            'thumbnail_object_digest', v_thumbnail_object_digest
          )
        );

        insert into public.dm_media_cleanup_snapshots (
          cleanup_id,
          outbox_event_id,
          message_id,
          thread_id,
          actor_id,
          sequence,
          main_path,
          main_object_id,
          main_object_version,
          main_object_digest,
          thumbnail_path,
          thumbnail_object_id,
          thumbnail_object_version,
          thumbnail_object_digest
        )
        values (
          v_cleanup_id,
          v_cleanup_event_id,
          p_message_id,
          p_thread_id,
          p_actor_id,
          v_message.sequence,
          v_media_path,
          v_media_object_id,
          v_media_object_version,
          v_media_object_digest,
          v_thumbnail_path,
          v_thumbnail_object_id,
          v_thumbnail_object_version,
          v_thumbnail_object_digest
        );
      end if;
    end if;

    select pg_catalog.jsonb_build_object(
      'message', pg_catalog.jsonb_build_object(
        'id', message.id,
        'thread_id', message.thread_id,
        'sender_id', message.sender_id,
        'content', message.content,
        'message_type', message.message_type,
        'media_url', message.media_url,
        'media_thumbnail_url', message.media_thumbnail_url,
        'is_read', message.is_read,
        'is_edited', message.is_edited,
        'is_deleted', message.is_deleted,
        'created_at', message.created_at,
        'sequence', message.sequence,
        'client_id', message.client_id,
        'reply_to_id', message.reply_to_id,
        'reply_to', case when message.reply_to_id is null then null else (
          select pg_catalog.jsonb_build_object(
            'id', reply.id,
            'sender_id', reply.sender_id,
            'content', reply.content
          )
          from public.dm_messages reply
          where reply.id = message.reply_to_id
            and reply.thread_id = message.thread_id
        ) end,
        'sender', pg_catalog.jsonb_build_object(
          'id', sender.id,
          'username', sender.username,
          'display_name', sender.display_name,
          'avatar_url', sender.avatar_url,
          'location_text', sender.location_text,
          'is_online', sender.is_online,
          'last_seen_at', sender.last_seen_at
        )
      )
    )
    into v_response_body
    from public.dm_messages message
    join public.profiles sender on sender.id = message.sender_id
    where message.id = p_message_id
      and message.thread_id = p_thread_id;
    v_response_status := 200;
  end mutation;

  insert into public.idempotency_records (
    actor_id,
    operation,
    key,
    request_hash,
    response_status,
    response_body
  )
  values (
    p_actor_id,
    p_operation,
    p_idempotency_key,
    p_request_hash,
    v_response_status,
    v_response_body
  );

  return pg_catalog.jsonb_build_object(
    'response_status', v_response_status,
    'response_body', v_response_body,
    'replayed', false
  );
end;
$function$;

-- Captured mark_thread_read_sequence(uuid,uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.mark_thread_read_sequence(p_thread_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sequence bigint;
  v_last_read_sequence bigint;
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);
  select thread.next_message_sequence, coalesce(member.last_read_sequence, 0)
  into v_sequence, v_last_read_sequence
  from public.dm_threads thread
  join public.dm_thread_members member
    on member.thread_id = thread.id
   and member.user_id = p_user_id
  where thread.id = p_thread_id
  for update of member;

  if not found then
    return jsonb_build_object('error', 'THREAD_NOT_FOUND');
  end if;

  if not public.can_users_interact_v1(p_user_id, (select case when thread.participant_1_id = p_user_id then thread.participant_2_id else thread.participant_1_id end from public.dm_threads thread where thread.id = p_thread_id)) then
    return jsonb_build_object('error', 'THREAD_NOT_FOUND');
  end if;

  if v_sequence > v_last_read_sequence then
    update public.dm_thread_members
    set
      last_read_sequence = v_sequence,
      updated_at = now()
    where thread_id = p_thread_id
      and user_id = p_user_id;

    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    select
      'message.changed',
      'dm_thread',
      p_thread_id::text,
      jsonb_build_object(
        'thread_id', p_thread_id,
        'actor_id', p_user_id,
        'recipient_id', case
          when thread.participant_1_id = p_user_id then thread.participant_2_id
          else thread.participant_1_id
        end,
        'sequence', v_sequence,
        'action', 'read'
      )
    from public.dm_threads thread
    where thread.id = p_thread_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'last_read_sequence', v_sequence
  );
end;
$function$;

-- Captured begin_call_session(uuid,uuid,uuid,uuid,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.begin_call_session(p_call_id uuid, p_thread_id uuid, p_actor_id uuid, p_command_id uuid, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_thread public.dm_threads%rowtype;
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_callee_id uuid;
  v_replayed boolean := false;
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_call_id is null or p_thread_id is null or p_actor_id is null or p_command_id is null
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid call command' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_call_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-thread:' || p_thread_id::text, 0)
  );

  select thread.* into v_thread
  from public.dm_threads thread
  where thread.id = p_thread_id
    and p_actor_id in (thread.participant_1_id, thread.participant_2_id);
  if not found then
    raise exception 'Call thread not found' using errcode = '42501';
  end if;

  v_callee_id := case
    when v_thread.participant_1_id = p_actor_id then v_thread.participant_2_id
    else v_thread.participant_1_id
  end;

  if not public.can_users_interact_v1(p_actor_id, v_callee_id) then
    raise exception 'Call is not allowed' using errcode = '42501';
  end if;

  -- Serialize overlapping calls by participant in a stable order. This makes
  -- simultaneous cross-invites converge to one session instead of two rings.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when p_actor_id::text < v_callee_id::text then p_actor_id::text else v_callee_id::text end,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when p_actor_id::text < v_callee_id::text then v_callee_id::text else p_actor_id::text end,
      0
    )
  );

  -- Bound durable replay state without a table-wide cron dependency. Each new
  -- invite removes a small SKIP LOCKED batch that is safely outside the replay
  -- and reconnect window; command rows cascade with their session.
  with expired as (
    select session.id
    from public.call_sessions session
    where (
      session.state in ('rejected', 'cancelled', 'ended')
      and session.updated_at < now() - interval '1 hour'
    ) or (
      session.state in ('invited', 'accepted', 'negotiating', 'connected')
      and session.expires_at < now() - interval '1 hour'
    )
    order by session.updated_at asc
    limit 100
    for update skip locked
  )
  delete from public.call_sessions session
  using expired
  where session.id = expired.id;

  if exists (
    select 1 from public.profiles profile
    where profile.id in (p_actor_id, v_callee_id)
      and (profile.deleted_at is not null or profile.onboarding_completed is not true)
  ) or (
    select count(*) from public.profiles profile
    where profile.id in (p_actor_id, v_callee_id)
  ) <> 2 or exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = p_actor_id and block.blocked_id = v_callee_id)
       or (block.blocker_id = v_callee_id and block.blocked_id = p_actor_id)
  ) then
    raise exception 'Call is not allowed' using errcode = '42501';
  end if;

  if (
    select pg_catalog.count(*)
    from public.dm_thread_members member
    where member.thread_id = p_thread_id
      and member.user_id in (p_actor_id, v_callee_id)
  ) <> 2 then
    raise exception 'Call thread membership is incomplete' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id
  for update;

  if found then
    if v_session.thread_id <> p_thread_id or v_session.caller_id <> p_actor_id
       or v_session.callee_id <> v_callee_id then
      raise exception 'Call identifier is already owned' using errcode = '23505';
    end if;
    select command.* into v_command
    from public.call_signal_commands command
    where command.call_id = p_call_id and command.command_id = p_command_id;
    if not found or v_command.event_type <> 'invite'
       or v_command.sender_id <> p_actor_id or v_command.payload_hash <> p_payload_hash then
      raise exception 'Call command identifier was reused' using errcode = '23505';
    end if;
    if v_command.expires_at <= now() then
      raise exception 'Call command expired' using errcode = '57014';
    end if;
    v_replayed := true;
  else
    if exists (
      select 1
      from public.call_sessions active
      where active.id <> p_call_id
        and active.state in ('invited', 'accepted', 'negotiating', 'connected')
        and active.expires_at > now()
        and (
          p_actor_id in (active.caller_id, active.callee_id)
          or v_callee_id in (active.caller_id, active.callee_id)
        )
    ) then
      raise exception 'A participant is already in a call' using errcode = '55000';
    end if;

    insert into public.call_sessions (
      id, thread_id, caller_id, callee_id, state, last_sequence, expires_at
    ) values (
      p_call_id, p_thread_id, p_actor_id, v_callee_id, 'invited', 1,
      now() + interval '30 seconds'
    ) returning * into v_session;

    insert into public.call_signal_commands (
      call_id, command_id, sender_id, recipient_id, event_type,
      payload_hash, sequence, expires_at
    ) values (
      p_call_id, p_command_id, p_actor_id, v_callee_id, 'invite',
      p_payload_hash, 1, v_session.expires_at
    ) returning * into v_command;

    insert into public.outbox_events (
      event_type, aggregate_type, aggregate_id, payload
    ) values (
      'call.invite', 'call', p_call_id,
      pg_catalog.jsonb_build_object(
        'recipient_id', v_callee_id,
        'sender_id', p_actor_id,
        'thread_id', p_thread_id,
        'call_id', p_call_id
      )
    ) on conflict (event_type, aggregate_id) do nothing;
  end if;

  return pg_catalog.jsonb_build_object(
    'call_id', v_session.id,
    'thread_id', v_session.thread_id,
    'capability', v_session.capability,
    'sender_id', v_session.caller_id,
    'recipient_id', v_session.callee_id,
    'sequence', v_command.sequence,
    'issued_at', v_command.created_at,
    'expires_at', v_command.expires_at,
    'replayed', v_replayed
  );
end;
$function$;

-- Captured advance_call_session(uuid,uuid,uuid,uuid,uuid,text,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.advance_call_session(p_call_id uuid, p_thread_id uuid, p_actor_id uuid, p_capability uuid, p_command_id uuid, p_event_type text, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_recipient_id uuid;
  v_event_expires_at timestamptz;
  v_replayed boolean := false;
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_call_id is null or p_thread_id is null or p_actor_id is null
     or p_capability is null or p_command_id is null
     or p_event_type is null
     or p_event_type not in ('cancel', 'accept', 'reject', 'offer', 'answer', 'ice', 'end', 'heartbeat')
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid call command' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_call_id::text, 0)
  );

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id;
  if not found then
    raise exception 'Call session not found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-thread:' || v_session.thread_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.caller_id::text else v_session.callee_id::text end,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.callee_id::text else v_session.caller_id::text end,
      0
    )
  );

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id
  for update;
  if not found or v_session.thread_id <> p_thread_id or v_session.capability <> p_capability
     or p_actor_id not in (v_session.caller_id, v_session.callee_id) then
    raise exception 'Call session not found' using errcode = '42501';
  end if;

  v_recipient_id := case
    when p_actor_id = v_session.caller_id then v_session.callee_id
    else v_session.caller_id
  end;

  if p_event_type in ('accept', 'offer', 'answer', 'ice') and not public.can_users_interact_v1(p_actor_id, v_recipient_id) then
    raise exception 'Call is no longer allowed' using errcode = '42501';
  end if;

  if p_event_type in ('accept', 'offer', 'answer', 'ice') and (
    not exists (
      select 1 from public.dm_threads thread
    join public.profiles caller on caller.id = v_session.caller_id
      and caller.deleted_at is null and caller.onboarding_completed is true
    join public.profiles callee on callee.id = v_session.callee_id
      and callee.deleted_at is null and callee.onboarding_completed is true
    where thread.id = v_session.thread_id
      and thread.participant_1_id in (v_session.caller_id, v_session.callee_id)
      and thread.participant_2_id in (v_session.caller_id, v_session.callee_id)
      and (
        select pg_catalog.count(*)
        from public.dm_thread_members member
        where member.thread_id = v_session.thread_id
          and member.user_id in (v_session.caller_id, v_session.callee_id)
      ) = 2
    ) or exists (
      select 1 from public.user_blocks block
      where (block.blocker_id = v_session.caller_id and block.blocked_id = v_session.callee_id)
         or (block.blocker_id = v_session.callee_id and block.blocked_id = v_session.caller_id)
    )
  ) then
    raise exception 'Call is no longer allowed' using errcode = '42501';
  end if;

  select command.* into v_command
  from public.call_signal_commands command
  where command.call_id = p_call_id and command.command_id = p_command_id;
  if found then
    if v_command.sender_id <> p_actor_id or v_command.recipient_id <> v_recipient_id
       or v_command.event_type <> p_event_type or v_command.payload_hash <> p_payload_hash then
      raise exception 'Call command identifier was reused' using errcode = '23505';
    end if;
    if v_command.expires_at <= now() then
      raise exception 'Call command expired' using errcode = '57014';
    end if;
    v_replayed := true;
  else
    if v_session.expires_at <= now() then
      raise exception 'Call session expired' using errcode = '57014';
    end if;
    if p_event_type = 'accept' then
      if p_actor_id <> v_session.callee_id or v_session.state <> 'invited' then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'accepted';
      v_session.expires_at := now() + interval '2 minutes';
    elsif p_event_type = 'reject' then
      if p_actor_id <> v_session.callee_id or v_session.state <> 'invited' then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'rejected';
    elsif p_event_type = 'cancel' then
      if p_actor_id <> v_session.caller_id or v_session.state not in ('invited', 'accepted') then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'cancelled';
    elsif p_event_type = 'offer' then
      if p_actor_id <> v_session.caller_id or v_session.state <> 'accepted' then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'negotiating';
      v_session.expires_at := now() + interval '2 minutes';
    elsif p_event_type = 'answer' then
      if p_actor_id <> v_session.callee_id or v_session.state <> 'negotiating' then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'connected';
      v_session.expires_at := now() + interval '90 seconds';
    elsif p_event_type = 'ice' then
      if v_session.state not in ('negotiating', 'connected') then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
    elsif p_event_type = 'heartbeat' then
      if v_session.state <> 'connected' then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.expires_at := now() + interval '90 seconds';
    elsif p_event_type = 'end' then
      if v_session.state not in ('accepted', 'negotiating', 'connected') then
        raise exception 'Invalid call transition' using errcode = '55000';
      end if;
      v_session.state := 'ended';
    end if;

    v_session.last_sequence := v_session.last_sequence + 1;
    v_event_expires_at := now() + interval '15 seconds';
    update public.call_sessions
    set state = v_session.state,
        last_sequence = v_session.last_sequence,
        expires_at = v_session.expires_at,
        updated_at = now()
    where id = v_session.id;

    insert into public.call_signal_commands (
      call_id, command_id, sender_id, recipient_id, event_type,
      payload_hash, sequence, expires_at
    ) values (
      v_session.id, p_command_id, p_actor_id, v_recipient_id, p_event_type,
      p_payload_hash, v_session.last_sequence, v_event_expires_at
    ) returning * into v_command;
  end if;

  return pg_catalog.jsonb_build_object(
    'call_id', v_session.id,
    'thread_id', v_session.thread_id,
    'capability', v_session.capability,
    'sender_id', v_command.sender_id,
    'recipient_id', v_command.recipient_id,
    'sequence', v_command.sequence,
    'issued_at', v_command.created_at,
    'expires_at', v_command.expires_at,
    'replayed', v_replayed
  );
end;
$function$;

-- Captured recover_cancel_call_session(uuid,uuid,uuid,uuid,uuid,text,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.recover_cancel_call_session(p_call_id uuid, p_thread_id uuid, p_actor_id uuid, p_command_id uuid, p_invite_command_id uuid, p_invite_payload_hash text, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_invite public.call_signal_commands%rowtype;
  v_event_expires_at timestamptz;
  v_replayed boolean := false;
BEGIN
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_call_id is null or p_thread_id is null or p_actor_id is null
     or p_command_id is null or p_invite_command_id is null
     or p_invite_payload_hash is null or p_invite_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid call recovery command' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_call_id::text, 0)
  );

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id;
  if not found then
    raise exception 'Call session not found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-thread:' || v_session.thread_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.caller_id::text else v_session.callee_id::text end,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.callee_id::text else v_session.caller_id::text end,
      0
    )
  );

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id
  for update;
  if not found or v_session.thread_id <> p_thread_id
     or v_session.caller_id <> p_actor_id then
    raise exception 'Call session not found' using errcode = '42501';
  end if;

  -- Recovery cancellation is owner-authorized cleanup after peer deletion or admission loss.

  -- A successfully-created recovery command is sufficient proof for replay,
  -- even if the shorter-lived original invite record has since expired.
  select command.* into v_command
  from public.call_signal_commands command
  where command.call_id = p_call_id and command.command_id = p_command_id;
  if found then
    if v_command.sender_id <> v_session.caller_id
       or v_command.recipient_id <> v_session.callee_id
       or v_command.event_type <> 'cancel'
       or v_command.payload_hash <> p_payload_hash then
      raise exception 'Call command identifier was reused' using errcode = '23505';
    end if;
    if v_command.expires_at <= now() then
      raise exception 'Call command expired' using errcode = '57014';
    end if;
    v_replayed := true;
  else
    select command.* into v_invite
    from public.call_signal_commands command
    where command.call_id = p_call_id and command.command_id = p_invite_command_id;
    if not found or v_invite.event_type <> 'invite'
       or v_invite.sender_id <> v_session.caller_id
       or v_invite.recipient_id <> v_session.callee_id
       or v_invite.payload_hash <> p_invite_payload_hash then
      raise exception 'Original invite command is invalid' using errcode = '42501';
    end if;
    if v_invite.expires_at <= now() or v_session.expires_at <= now() then
      raise exception 'Call recovery window expired' using errcode = '57014';
    end if;
    if v_session.state not in ('invited', 'accepted') then
      raise exception 'Invalid call transition' using errcode = '55000';
    end if;

    v_session.state := 'cancelled';
    v_session.last_sequence := v_session.last_sequence + 1;
    v_session.expires_at := now();
    v_event_expires_at := now() + interval '15 seconds';

    update public.call_sessions
    set state = v_session.state,
        last_sequence = v_session.last_sequence,
        expires_at = v_session.expires_at,
        updated_at = now()
    where id = v_session.id;

    insert into public.call_signal_commands (
      call_id, command_id, sender_id, recipient_id, event_type,
      payload_hash, sequence, expires_at
    ) values (
      v_session.id, p_command_id, v_session.caller_id, v_session.callee_id,
      'cancel', p_payload_hash, v_session.last_sequence, v_event_expires_at
    ) returning * into v_command;
  end if;

  return pg_catalog.jsonb_build_object(
    'call_id', v_session.id,
    'thread_id', v_session.thread_id,
    'capability', v_session.capability,
    'sender_id', v_command.sender_id,
    'recipient_id', v_command.recipient_id,
    'sequence', v_command.sequence,
    'issued_at', v_command.created_at,
    'expires_at', v_command.expires_at,
    'replayed', v_replayed
  );
end;
$function$;

-- Captured send_shared_group_message_transactional(uuid,uuid,uuid,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.send_shared_group_message_transactional(p_group_id uuid, p_sender_id uuid, p_client_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.shared_groups%rowtype;
  v_profile public.profiles%rowtype;
  v_existing public.shared_group_messages%rowtype;
  v_message public.shared_group_messages%rowtype;
  v_sequence bigint;
  v_message_json jsonb;
BEGIN
  perform public.require_adult_social_admission_v1(p_sender_id);
  select * into v_profile
  from public.profiles profile
  where profile.id = p_sender_id
  for update;

  if not found or v_profile.deleted_at is not null then
    if not exists (
      select 1
      from public.shared_group_members member
      where member.group_id = p_group_id and member.user_id = p_sender_id
    ) then
      return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
    end if;
    return pg_catalog.jsonb_build_object('error', 'ACCOUNT_NOT_ACTIVE');
  end if;

  if p_content is null
     or p_content is distinct from pg_catalog.btrim(p_content)
     or pg_catalog.char_length(p_content) not between 1 and 4000 then
    return pg_catalog.jsonb_build_object('error', 'INVALID_MESSAGE');
  end if;

  select * into v_group
  from public.shared_groups group_row
  where group_row.id = p_group_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  if not exists (
    select 1 from public.shared_group_members member
    where member.group_id = p_group_id and member.user_id = p_sender_id
  ) then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
  if exists (select 1 from public.shared_group_members member where member.group_id = p_group_id and member.user_id <> p_sender_id and not public.can_users_interact_v1(p_sender_id, member.user_id)) then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  select * into v_existing
  from public.shared_group_messages message
  where message.group_id = p_group_id and message.client_id = p_client_id;
  if found then
    if v_existing.sender_id is distinct from p_sender_id
       or v_existing.content is distinct from p_content then
      return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
    end if;
    v_message := v_existing;
  else
    update public.shared_groups group_row
    set next_message_sequence = group_row.next_message_sequence + 1,
        last_message_at = pg_catalog.clock_timestamp(),
        last_message_preview = left(p_content, 140)
    where group_row.id = p_group_id
    returning next_message_sequence into v_sequence;

    insert into public.shared_group_messages (
      group_id, sender_id, client_id, sequence, content, is_read
    )
    values (p_group_id, p_sender_id, p_client_id, v_sequence, p_content, true)
    returning * into v_message;

    update public.shared_group_members member
    set last_read_sequence = greatest(member.last_read_sequence, v_sequence),
        updated_at = pg_catalog.clock_timestamp()
    where member.group_id = p_group_id and member.user_id = p_sender_id;

    insert into public.outbox_events (
      event_type, aggregate_type, aggregate_id, payload
    )
    values (
      'shared_group.message.changed',
      'shared_group',
      p_group_id::text,
      pg_catalog.jsonb_build_object(
        'group_id', p_group_id,
        'message_id', v_message.id,
        'sender_id', p_sender_id,
        'recipient_ids', (
          select coalesce(
            pg_catalog.jsonb_agg(member.user_id order by member.user_id),
            '[]'::jsonb
          )
          from public.shared_group_members member
          where member.group_id = p_group_id
        ),
        'sequence', v_sequence,
        'action', 'sent'
      )
    );
  end if;

  select (pg_catalog.to_jsonb(message.*) - 'group_id') || pg_catalog.jsonb_build_object(
    'thread_id', message.group_id,
    'sender', pg_catalog.to_jsonb(sender.*),
    'reply_to', null
  )
  into v_message_json
  from public.shared_group_messages message
  join public.profiles sender on sender.id = message.sender_id
  where message.id = v_message.id;

  return pg_catalog.jsonb_build_object(
    'message', v_message_json,
    'deduplicated', v_existing.id is not null
  );
end;
$function$;

-- Captured mark_shared_group_read(uuid,uuid); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.mark_shared_group_read(p_group_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_sequence bigint; v_last_read_sequence bigint;
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);
select group_row.next_message_sequence,member.last_read_sequence into v_sequence,v_last_read_sequence from public.shared_groups group_row join public.shared_group_members member on member.group_id=group_row.id and member.user_id=p_user_id where group_row.id=p_group_id for update of member;
if not found then return pg_catalog.jsonb_build_object('error','GROUP_NOT_FOUND'); end if;
  if exists (select 1 from public.shared_group_members member where member.group_id = p_group_id and member.user_id <> p_user_id and not public.can_users_interact_v1(p_user_id, member.user_id)) then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
if v_sequence>v_last_read_sequence then update public.shared_group_members member set last_read_sequence=v_sequence,updated_at=pg_catalog.clock_timestamp() where member.group_id=p_group_id and member.user_id=p_user_id;
insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('shared_group.message.changed','shared_group',p_group_id::text,pg_catalog.jsonb_build_object('group_id',p_group_id,'recipient_ids',(select coalesce(pg_catalog.jsonb_agg(member.user_id order by member.user_id),'[]'::jsonb) from public.shared_group_members member where member.group_id=p_group_id),'actor_id',p_user_id,'sequence',v_sequence,'action','read')); end if;
return pg_catalog.jsonb_build_object('success',true,'last_read_sequence',greatest(v_sequence,v_last_read_sequence));
end; $function$;

-- Captured create_or_join_shared_group(uuid,text); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.create_or_join_shared_group(p_user_id uuid, p_qr_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_group public.shared_groups%rowtype; v_profile public.profiles%rowtype; v_hash text; v_new_group boolean:=false; v_new_member boolean:=false;
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);
if p_qr_content is null or pg_catalog.char_length(p_qr_content)<1 or pg_catalog.char_length(p_qr_content)>4096 then return pg_catalog.jsonb_build_object('error','INVALID_QR_CONTENT'); end if;
select * into v_profile from public.profiles profile where profile.id=p_user_id for update;
if not found or v_profile.deleted_at is not null then return pg_catalog.jsonb_build_object('error','ACCOUNT_NOT_ACTIVE'); end if;
v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_qr_content,'UTF8'),'sha256'),'hex');
insert into public.shared_groups(qr_content_hash,created_by) values(v_hash,p_user_id) on conflict(qr_content_hash) do nothing returning * into v_group;
if not found then select * into v_group from public.shared_groups group_row where group_row.qr_content_hash=v_hash for update; else v_new_group:=true; end if;

  if exists (select 1 from public.shared_group_members member where member.group_id = v_group.id and member.user_id <> p_user_id and not public.can_users_interact_v1(p_user_id, member.user_id)) then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
insert into public.shared_group_members(group_id,user_id) values(v_group.id,p_user_id) on conflict(group_id,user_id) do nothing;
v_new_member:=found;
if v_new_member then insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload) values('shared_group.message.changed','shared_group',v_group.id::text,pg_catalog.jsonb_build_object('group_id',v_group.id,'recipient_ids',(select coalesce(pg_catalog.jsonb_agg(member.user_id order by member.user_id),'[]'::jsonb) from public.shared_group_members member where member.group_id=v_group.id),'actor_id',p_user_id,'action','membership')); end if;
return pg_catalog.jsonb_build_object('group',pg_catalog.jsonb_build_object('id',v_group.id,'name','Shared group','member_count',(select count(*)::integer from public.shared_group_members member where member.group_id=v_group.id),'last_message_at',v_group.last_message_at,'last_message_preview',v_group.last_message_preview,'created_at',v_group.created_at,'unread_count',(select count(*)::integer from public.shared_group_messages unread_message join public.shared_group_members unread_member on unread_member.group_id=unread_message.group_id and unread_member.user_id=p_user_id where unread_message.group_id=v_group.id and unread_message.sequence>unread_member.last_read_sequence)),'is_new_group',v_new_group,'is_new_member',v_new_member);
end; $function$;


-- Captured get_shared_groups(uuid,timestamptz,uuid,integer); owner postgres; ACL {postgres=X/postgres,service_role=X/postgres}.
CREATE OR REPLACE FUNCTION public.get_shared_groups(p_user_id uuid, p_before_sort_at timestamp with time zone, p_before_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);

  return (
    select coalesce(
      pg_catalog.jsonb_agg(item.payload order by item.sort_at desc, item.id desc),
      '[]'::jsonb
    )
    from (
      select
        group_row.id,
        coalesce(group_row.last_message_at, group_row.created_at) as sort_at,
        pg_catalog.jsonb_build_object(
          'id', group_row.id,
          'name', 'Shared group',
          'member_count', (
            select pg_catalog.count(*)::integer
            from public.shared_group_members count_member
            where count_member.group_id = group_row.id
          ),
          'last_message_at', group_row.last_message_at,
          'last_message_preview', group_row.last_message_preview,
          'created_at', group_row.created_at,
          'unread_count', (
            select pg_catalog.count(*)::integer
            from public.shared_group_messages unread_message
            where unread_message.group_id = group_row.id
              and unread_message.sequence > member.last_read_sequence
          )
        ) as payload
      from public.shared_group_members member
      join public.shared_groups group_row on group_row.id = member.group_id
      join public.profiles profile on profile.id = member.user_id
      where member.user_id = p_user_id
        and profile.deleted_at is null
        and not exists (
          select 1
          from public.shared_group_members peer_member
          where peer_member.group_id = group_row.id
            and peer_member.user_id <> p_user_id
            and not public.can_users_interact_v1(p_user_id, peer_member.user_id)
        )
        and (
          p_before_sort_at is null
          or coalesce(group_row.last_message_at, group_row.created_at) < p_before_sort_at
          or (
            coalesce(group_row.last_message_at, group_row.created_at) = p_before_sort_at
            and group_row.id < p_before_id
          )
        )
      order by coalesce(group_row.last_message_at, group_row.created_at) desc, group_row.id desc
      limit least(greatest(p_limit, 1), 100) + 1
    ) item
  );
END;
$function$;
-- END AGE MESSAGING

-- BEGIN AGE GROUP_DETAIL
-- New server-only group-detail reader.
-- Root assembles this function into the age-admission migration and its rollback drops it.
-- No legacy definition exists to capture.
CREATE OR REPLACE FUNCTION public.get_shared_group_detail_for_user_v1(
  p_group_id uuid,
  p_user_id uuid,
  p_before_sequence bigint,
  p_before_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_last_read_sequence bigint;
  v_limit integer;
BEGIN
  perform public.require_adult_social_admission_v1(p_user_id);

  if p_group_id is null or p_user_id is null then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;
  v_limit := least(greatest(coalesce(p_limit, 1), 1), 100);

  select member.last_read_sequence
  into v_last_read_sequence
  from public.shared_group_members member
  where member.group_id = p_group_id
    and member.user_id = p_user_id;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'GROUP_NOT_FOUND');
  end if;

  return (
    with eligible_members as materialized (
      select member.user_id
      from public.shared_group_members member
      join public.profiles profile on profile.id = member.user_id
      where member.group_id = p_group_id
        and (
          member.user_id = p_user_id
          or public.can_users_interact_v1(p_user_id, member.user_id)
        )
    ),
    latest_visible as (
      select message.created_at, message.content, message.is_deleted
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      where message.group_id = p_group_id
      order by message.sequence desc, message.id desc
      limit 1
    ),
    visible_unread as (
      select pg_catalog.count(*)::integer as count
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      where message.group_id = p_group_id
        and message.sequence > v_last_read_sequence
    ),
    page_messages as (
      select
        message.id,
        message.group_id,
        message.sender_id,
        message.client_id,
        message.sequence,
        message.content,
        message.message_type,
        message.media_url,
        message.media_thumbnail_url,
        message.is_read,
        message.is_edited,
        message.is_deleted,
        message.created_at,
        pg_catalog.jsonb_build_object(
          'id', sender.id,
          'username', sender.username,
          'display_name', sender.display_name,
          'avatar_url', sender.avatar_url,
          'location_text', sender.location_text,
          'is_online', sender.is_online,
          'last_seen_at', sender.last_seen_at
        ) as sender
      from public.shared_group_messages message
      join eligible_members eligible on eligible.user_id = message.sender_id
      join public.profiles sender on sender.id = message.sender_id
      where message.group_id = p_group_id
        and (
          p_before_sequence is null
          or message.sequence < p_before_sequence
          or (message.sequence = p_before_sequence and message.id < p_before_id)
        )
      order by message.sequence desc, message.id desc
      limit v_limit + 1
    )
    select pg_catalog.jsonb_build_object(
      'group', pg_catalog.jsonb_build_object(
        'id', group_row.id,
        'name', 'Shared group',
        'member_count', (select pg_catalog.count(*)::integer from eligible_members),
        'last_message_at', (select latest.created_at from latest_visible latest),
        'last_message_preview', (
          select case
            when latest.is_deleted then null
            else pg_catalog.left(latest.content, 140)
          end
          from latest_visible latest
        ),
        'created_at', group_row.created_at,
        'unread_count', (select unread.count from visible_unread unread)
      ),
      'messages', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', message.id,
              'group_id', message.group_id,
              'sender_id', message.sender_id,
              'client_id', message.client_id,
              'sequence', message.sequence,
              'content', message.content,
              'message_type', message.message_type,
              'media_url', message.media_url,
              'media_thumbnail_url', message.media_thumbnail_url,
              'is_read', message.is_read,
              'is_edited', message.is_edited,
              'is_deleted', message.is_deleted,
              'created_at', message.created_at,
              'reply_to_id', null,
              'reply_to', null,
              'sender', message.sender
            )
            order by message.sequence desc, message.id desc
          )
          from page_messages message
        ),
        '[]'::jsonb
      ),
      'last_read_sequence', v_last_read_sequence
    )
    from public.shared_groups group_row
    where group_row.id = p_group_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_group_detail_for_user_v1(uuid, uuid, bigint, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_group_detail_for_user_v1(uuid, uuid, bigint, uuid, integer) TO service_role;
-- END AGE GROUP_DETAIL

-- BEGIN AGE PRODUCT
-- PROPOSED REVIEW FRAGMENT ONLY. Do not apply directly as a migration.
--
-- Captured against repository migrations through 20260908125054_account_age_admission.sql.
-- It replaces only product social/Plan RPC definitions after the age-admission helpers exist.
--
-- Required helper inventory (implemented by the age-admission deployment):
--   public.require_adult_social_admission_v1(uuid) returns void
--     Raises AGE_ADMISSION_REQUIRED or AGE_NOT_ELIGIBLE before any idempotency
--     lookup, write, outbox effect, or product response.
--   public.is_adult_social_admitted_v1(uuid) returns boolean
--   public.can_users_interact_v1(uuid, uuid) returns boolean
--     True only for two distinct, active, adult-admitted profiles with no block either way.
--
-- Function inventory covered here:
-- availability: upsert_user_availability, clear_user_availability, get_available_people
-- discovery: discovery_subject_visible_to_viewer
-- Pokes: create_poke, get_active_pokes, respond_to_poke, authorize_poke_delivery
-- Plans: plan_create_v1/v2, plans_list_v1/v2, plan_read/update/cancel/join/leave,
--        plan_share_create/revoke/public_preview, plan payload/visibility/idempotency helpers,
--        and Plan meetup status/acknowledgement.

-- A non-adult or deleted member makes the entire Plan unavailable. This avoids
-- exposing an adult owner or other members through a Plan that contains an
-- ineligible participant.
create or replace function public.plan_members_are_adult_v1(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.plan_members member
    where member.plan_id = p_plan_id
      and not public.is_adult_social_admitted_v1(member.user_id)
  );
$$;

create or replace function public.plan_is_blocked_v1(p_actor_id uuid, p_peer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_id is not null
    and p_peer_id is not null
    and p_actor_id <> p_peer_id
    and not public.can_users_interact_v1(p_actor_id, p_peer_id);
$$;

create or replace function public.plan_has_blocked_member_v1(p_actor_id uuid, p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.plan_members_are_adult_v1(p_plan_id)
    or exists (
      select 1 from public.plan_members member
      where member.plan_id = p_plan_id
        and member.user_id <> p_actor_id
        and public.plan_is_blocked_v1(p_actor_id, member.user_id)
    );
$$;

create or replace function public.plan_viewable_v1(p_actor_id uuid, p_plan public.plans)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if not public.is_adult_social_admitted_v1(p_plan.owner_id)
     or public.plan_has_blocked_member_v1(p_actor_id, p_plan.id) then
    return false;
  end if;
  if p_actor_id = p_plan.owner_id then return true; end if;
  if exists (select 1 from public.plan_members member where member.plan_id = p_plan.id and member.user_id = p_actor_id) then return true; end if;
  if p_plan.status <> 'active' then return false; end if;
  if p_plan.visibility = 'open' then return true; end if;
  if p_plan.visibility = 'friends' then
    return exists (select 1 from public.friendships friendship where friendship.status = 'accepted' and ((friendship.requester_id = p_actor_id and friendship.addressee_id = p_plan.owner_id) or (friendship.addressee_id = p_actor_id and friendship.requester_id = p_plan.owner_id)));
  end if;
  if p_plan.visibility = 'circle' then
    return exists (select 1 from public.shared_group_members member where member.group_id = p_plan.circle_id and member.user_id = p_actor_id);
  end if;
  return false;
end;
$$;

create or replace function public.plan_payload_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plans; v_count integer; v_is_member boolean; v_is_owner boolean;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not public.plan_viewable_v1(p_actor_id, v_plan) then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
  v_is_member := exists(select 1 from public.plan_members where plan_id = v_plan.id and user_id = p_actor_id);
  v_is_owner := v_plan.owner_id = p_actor_id;
  return jsonb_build_object('plan', jsonb_build_object(
    'id', v_plan.id, 'owner_id', v_plan.owner_id, 'activity', v_plan.activity, 'title', v_plan.title,
    'starts_at', v_plan.starts_at, 'place_text', v_plan.place_text, 'visibility', v_plan.visibility,
    'circle_id', v_plan.circle_id, 'participant_limit', v_plan.participant_limit, 'member_count', v_count,
    'status', v_plan.status, 'created_at', v_plan.created_at, 'updated_at', v_plan.updated_at,
    'viewer_is_member', v_is_member, 'viewer_is_owner', v_is_owner,
    'source_thread_id', case when v_plan.source_thread_id is not null and exists (select 1 from public.dm_thread_members tm where tm.thread_id = v_plan.source_thread_id and tm.user_id = p_actor_id) then v_plan.source_thread_id else null end
  ), 'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'joined_at', m.joined_at, 'display_name', profile.display_name, 'avatar_url', profile.avatar_url) order by m.joined_at) from public.plan_members m join public.profiles profile on profile.id = m.user_id and profile.deleted_at is null where m.plan_id = v_plan.id), '[]'::jsonb));
end;
$$;

create or replace function public.plan_create_finish_v1(p_actor_id uuid, p_idempotency_key text, p_request_hash text, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  insert into public.plan_create_idempotency(actor_id, idempotency_key, request_hash, response_body)
  values (p_actor_id, p_idempotency_key, p_request_hash, p_response);
  return p_response;
end;
$$;

create or replace function public.plan_join_finish_v1(p_actor_id uuid, p_idempotency_key text, p_request_hash text, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  insert into public.plan_join_idempotency(actor_id, idempotency_key, request_hash, response_body)
  values (p_actor_id, p_idempotency_key, p_request_hash, p_response);
  return p_response;
end;
$$;

create or replace function public.plan_create_v1(p_actor_id uuid, p_activity text, p_title text, p_starts_at timestamptz, p_place_text text, p_visibility text, p_circle_id uuid, p_participant_limit smallint, p_source_thread_id uuid, p_idempotency_key text, p_request_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan_id uuid; v_payload jsonb; v_existing public.plan_create_idempotency;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  perform pg_advisory_xact_lock(hashtext(p_actor_id::text || ':plan:create:' || p_idempotency_key));
  select * into v_existing from public.plan_create_idempotency where actor_id = p_actor_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> p_request_hash then return jsonb_build_object('error', 'IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.response_body || jsonb_build_object('replayed', true);
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and deleted_at is null) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  if p_activity is null or char_length(btrim(p_activity)) not between 1 and 48 or p_place_text is null or char_length(btrim(p_place_text)) not between 1 and 160 or p_title is not null and char_length(btrim(p_title)) not between 1 and 96 or p_starts_at <= now() or p_visibility not in ('private','friends','circle','open') or p_participant_limit not between 2 and 50 or ((p_visibility = 'circle') <> (p_circle_id is not null)) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'INVALID')); end if;
  if p_visibility = 'circle' and not exists (select 1 from public.shared_group_members where group_id = p_circle_id and user_id = p_actor_id) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  if p_source_thread_id is not null and not exists (select 1 from public.dm_thread_members where thread_id = p_source_thread_id and user_id = p_actor_id) then return public.plan_create_finish_v1(p_actor_id,p_idempotency_key,p_request_hash,jsonb_build_object('error', 'FORBIDDEN')); end if;
  insert into public.plans(owner_id, activity, title, starts_at, place_text, visibility, circle_id, participant_limit, source_thread_id) values (p_actor_id, btrim(p_activity), nullif(btrim(p_title), ''), p_starts_at, btrim(p_place_text), p_visibility, p_circle_id, p_participant_limit, p_source_thread_id) returning id into v_plan_id;
  insert into public.plan_members(plan_id, user_id, role) values (v_plan_id, p_actor_id, 'owner');
  v_payload := public.plan_payload_v1(p_actor_id, v_plan_id);
  v_payload := jsonb_build_object('plan', v_payload->'plan', 'replayed', false);
  return public.plan_create_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

create or replace function public.plan_update_v1(p_actor_id uuid, p_plan_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_visibility text;
  v_circle_id uuid;
  v_limit smallint;
  v_starts timestamptz;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return pg_catalog.jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_plan.owner_id <> p_actor_id then return pg_catalog.jsonb_build_object('error', 'FORBIDDEN'); end if;
  if not public.plan_members_are_adult_v1(v_plan.id) then return pg_catalog.jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_plan.status <> 'active' then return pg_catalog.jsonb_build_object('error', 'CANCELLED'); end if;
  if v_plan.starts_at <= pg_catalog.now() then return pg_catalog.jsonb_build_object('error', 'EXPIRED'); end if;

  v_visibility := coalesce(p_patch->>'visibility', v_plan.visibility);
  v_circle_id := case when p_patch ? 'circle_id' then nullif(p_patch->>'circle_id', '')::uuid else v_plan.circle_id end;
  v_limit := coalesce((p_patch->>'participant_limit')::smallint, v_plan.participant_limit);
  v_starts := coalesce((p_patch->>'starts_at')::timestamptz, v_plan.starts_at);
  if v_starts <= pg_catalog.now()
     or v_limit < (select count(*) from public.plan_members where plan_id = p_plan_id)
     or ((v_visibility = 'circle') <> (v_circle_id is not null))
     or (p_patch ? 'activity' and char_length(btrim(p_patch->>'activity')) not between 1 and 48)
     or (p_patch ? 'title' and p_patch->>'title' is not null and char_length(btrim(p_patch->>'title')) not between 1 and 96)
     or (p_patch ? 'place_text' and char_length(btrim(p_patch->>'place_text')) not between 1 and 160) then
    return pg_catalog.jsonb_build_object('error', 'INVALID');
  end if;
  if v_visibility = 'circle'
     and not exists (
       select 1 from public.shared_group_members
       where group_id = v_circle_id and user_id = p_actor_id
     ) then
    return pg_catalog.jsonb_build_object('error', 'FORBIDDEN');
  end if;

  update public.plans
  set activity = case when p_patch ? 'activity' then btrim(p_patch->>'activity') else activity end,
      title = case when p_patch ? 'title' then nullif(btrim(p_patch->>'title'), '') else title end,
      starts_at = v_starts,
      place_text = case when p_patch ? 'place_text' then btrim(p_patch->>'place_text') else place_text end,
      visibility = v_visibility,
      circle_id = v_circle_id,
      participant_limit = v_limit,
      updated_at = pg_catalog.now()
  where id = p_plan_id;
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

create or replace function public.plan_cancel_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select owner_id into v_owner from public.plans where id = p_plan_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_owner <> p_actor_id then return jsonb_build_object('error','FORBIDDEN'); end if;
  update public.plans set status = 'cancelled', updated_at = now() where id = p_plan_id;
  -- The owner may always read their own cancellation state.
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

create or replace function public.plan_join_v1(p_actor_id uuid, p_plan_id uuid, p_idempotency_key text, p_request_hash text, p_share_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.plan_join_idempotency; v_plan public.plans; v_payload jsonb; v_count integer; v_token_valid boolean;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  -- A row lock cannot protect an absent idempotency record. This bounded,
  -- transaction-scoped advisory lock serializes the same actor/key pair.
  if exists (select 1 from public.plans plan where plan.id = p_plan_id)
     and (not public.plan_members_are_adult_v1(p_plan_id) or public.plan_has_blocked_member_v1(p_actor_id, p_plan_id)) then
    return jsonb_build_object('error','NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_actor_id::text || ':' || p_idempotency_key));
  select * into v_existing from public.plan_join_idempotency where actor_id = p_actor_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> p_request_hash then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.response_body;
  end if;
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if public.plan_has_blocked_member_v1(p_actor_id, v_plan.id) then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if v_plan.status <> 'active' then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','CANCELLED')); end if;
  if v_plan.starts_at <= now() then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','EXPIRED')); end if;
  v_token_valid := p_share_token is not null and exists (select 1 from public.plan_share_tokens st where st.plan_id = v_plan.id and st.token_hash = extensions.digest(p_share_token, 'sha256') and (st.expires_at is null or st.expires_at > now()));
  if not public.plan_viewable_v1(p_actor_id, v_plan) and not v_token_valid then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','NOT_FOUND')); end if;
  if exists (select 1 from public.plan_members where plan_id = v_plan.id and user_id = p_actor_id) then
    v_payload := jsonb_build_object('plan', public.plan_payload_v1(p_actor_id, v_plan.id)->'plan', 'joined', false);
  else
    select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
    if v_count >= v_plan.participant_limit then return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, jsonb_build_object('error','FULL')); end if;
    insert into public.plan_members(plan_id, user_id, role) values (v_plan.id, p_actor_id, 'member');
    v_payload := jsonb_build_object('plan', public.plan_payload_v1(p_actor_id, v_plan.id)->'plan', 'joined', true);
  end if;
  return public.plan_join_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

create or replace function public.plan_leave_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan public.plans;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_plan.owner_id = p_actor_id then return jsonb_build_object('error','FORBIDDEN'); end if;
  delete from public.plan_members where plan_id = p_plan_id and user_id = p_actor_id;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  return jsonb_build_object('left', true);
end;
$$;

create or replace function public.plan_share_create_v1(p_actor_id uuid, p_plan_id uuid, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if not exists (select 1 from public.plans where id = p_plan_id and owner_id = p_actor_id and status = 'active') then return jsonb_build_object('error','NOT_FOUND'); end if;
  if not public.plan_members_are_adult_v1(p_plan_id) then return jsonb_build_object('error','NOT_FOUND'); end if;
  if p_expires_at is not null and p_expires_at <= now() then return jsonb_build_object('error','INVALID'); end if;
  v_token := translate(trim(trailing '=' from encode(extensions.gen_random_bytes(32), 'base64')), '+/', '-_');
  insert into public.plan_share_tokens(plan_id, token_hash, expires_at, created_by) values (p_plan_id, extensions.digest(v_token, 'sha256'), p_expires_at, p_actor_id);
  return jsonb_build_object('token', v_token, 'expires_at', p_expires_at);
end;
$$;

create or replace function public.plan_share_revoke_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if not exists (select 1 from public.plans where id = p_plan_id and owner_id = p_actor_id) then return jsonb_build_object('error','NOT_FOUND'); end if;
  delete from public.plan_share_tokens where plan_id = p_plan_id;
  return jsonb_build_object('revoked', true);
end;
$$;

create or replace function public.plan_create_v2(p_actor_id uuid, p_activity text, p_title text, p_starts_at timestamptz, p_place_text text, p_visibility text, p_circle_id uuid, p_participant_limit smallint, p_source_thread_id uuid, p_idempotency_key text, p_request_hash text, p_nearby_discovery boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.plan_create_idempotency; v_location public.user_locations; v_result jsonb; v_plan_id uuid;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
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

create or replace function public.plans_list_v1(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  return (
select jsonb_build_object('plans', coalesce(jsonb_agg(payload.plan order by payload.plan->>'starts_at', payload.plan->>'id'), '[]'::jsonb))
  from (
    select (public.plan_payload_v1(p_actor_id, p.id)->'plan') as plan
    from public.plans p
    where p.status = 'active' and p.starts_at > now() and public.plan_viewable_v1(p_actor_id, p)
    order by p.starts_at asc, p.id asc limit 100
  ) payload
  );
end;
$$;

create or replace function public.plans_list_v2(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  return (
with viewer as (
    select location.lat, location.lng
    from public.user_locations location
    where location.user_id = p_actor_id
      and location.updated_at > pg_catalog.now() - interval '10 minutes'
  ), recent_member_plans as (
    select plan.id, plan.starts_at, true as recent
    from public.plans plan
    join public.plan_members member
      on member.plan_id = plan.id and member.user_id = p_actor_id
    where plan.status = 'active'
      and plan.starts_at <= pg_catalog.now()
      and plan.starts_at > pg_catalog.now() - interval '48 hours'
      and not public.plan_has_blocked_member_v1(p_actor_id, plan.id)
    order by plan.starts_at desc, plan.id
    limit 20
  ), future_plans as (
    select plan.id, plan.starts_at, false as recent
    from public.plans plan
    where plan.status = 'active'
      and plan.starts_at > pg_catalog.now()
      and public.plan_viewable_v1(p_actor_id, plan)
      and (
        plan.visibility <> 'open'
        or plan.owner_id = p_actor_id
        or exists (
          select 1 from public.plan_members member
          where member.plan_id = plan.id and member.user_id = p_actor_id
        )
        or (
          plan.nearby_discoverable
          and exists (
            select 1 from viewer
            where 6371 * 2 * asin(sqrt(
              power(sin(radians((plan.nearby_lat - viewer.lat) / 2)), 2)
              + cos(radians(viewer.lat)) * cos(radians(plan.nearby_lat))
              * power(sin(radians((plan.nearby_lng - viewer.lng) / 2)), 2)
            )) <= 5
          )
        )
      )
    order by plan.starts_at, plan.id
    limit 80
  ), candidates as (
    select * from recent_member_plans
    union all
    select * from future_plans
  )
  select pg_catalog.jsonb_build_object(
    'plans',
    coalesce(
      jsonb_agg(
        public.plan_payload_v1(p_actor_id, candidate.id)->'plan'
        order by candidate.recent desc, candidate.starts_at, candidate.id
      ),
      '[]'::jsonb
    )
  )
  from candidates candidate
  );
end;
$$;

create or replace function public.plan_read_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  return public.plan_payload_v1(p_actor_id, p_plan_id);
end;
$$;

create or replace function public.plan_public_preview_v1(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plan public.plans; v_count integer;
begin
  if p_token is null or char_length(p_token) not between 16 and 256 then return jsonb_build_object('error','NOT_FOUND'); end if;
  select p.* into v_plan from public.plan_share_tokens st join public.plans p on p.id = st.plan_id where st.token_hash = extensions.digest(p_token, 'sha256') and (st.expires_at is null or st.expires_at > now()) limit 1;
  if not found or v_plan.status <> 'active' or not public.is_adult_social_admitted_v1(v_plan.owner_id) or not public.plan_members_are_adult_v1(v_plan.id) then return jsonb_build_object('error','NOT_FOUND'); end if;
  select count(*) into v_count from public.plan_members where plan_id = v_plan.id;
  return jsonb_build_object('plan', jsonb_build_object('id',v_plan.id,'activity',v_plan.activity,'title',v_plan.title,'starts_at',v_plan.starts_at,'place_text',v_plan.place_text,'participant_limit',v_plan.participant_limit,'member_count',v_count), 'can_join', v_plan.starts_at > now() and v_count < v_plan.participant_limit);
end;
$$;

create or replace function public.plan_meetup_status_v1(p_actor_id uuid, p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_closes_at timestamptz;
  v_acknowledgements jsonb;
  v_can_confirm boolean;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select plan.* into v_plan
  from public.plans plan
  join public.plan_members actor_member
    on actor_member.plan_id = plan.id and actor_member.user_id = p_actor_id
  join public.profiles actor_profile
    on actor_profile.id = p_actor_id and actor_profile.deleted_at is null
  where plan.id = p_plan_id
    and public.plan_members_are_adult_v1(plan.id)
    and not public.plan_has_blocked_member_v1(p_actor_id, plan.id);

  if v_plan.id is null then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if v_plan.status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'acknowledgements', '[]'::jsonb,
      'canConfirm', false,
      'closesAt', null
    );
  end if;

  v_closes_at := v_plan.starts_at + interval '48 hours';
  select coalesce(jsonb_agg(jsonb_build_object(
    'peerId', peer_member.user_id,
    'viewerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_a_confirmed_at is not null
           else acknowledgement.user_b_confirmed_at is not null end,
      false
    ),
    'peerConfirmed', coalesce(
      case when acknowledgement.user_a_id = p_actor_id then acknowledgement.user_b_confirmed_at is not null
           else acknowledgement.user_a_confirmed_at is not null end,
      false
    ),
    'confirmedAt', acknowledgement.confirmed_at
  ) order by peer_member.joined_at), '[]'::jsonb)
  into v_acknowledgements
  from public.plan_members peer_member
  join public.profiles peer_profile
    on peer_profile.id = peer_member.user_id and peer_profile.deleted_at is null
  left join public.plan_meetup_acknowledgements acknowledgement
    on acknowledgement.plan_id = v_plan.id
   and ((acknowledgement.user_a_id = least(p_actor_id, peer_member.user_id)
         and acknowledgement.user_b_id = greatest(p_actor_id, peer_member.user_id)))
  where peer_member.plan_id = v_plan.id
    and peer_member.user_id <> p_actor_id
    and public.can_users_interact_v1(p_actor_id, peer_member.user_id);

  v_can_confirm := v_plan.starts_at <= pg_catalog.now()
    and v_closes_at > pg_catalog.now()
    and jsonb_array_length(v_acknowledgements) > 0;

  return pg_catalog.jsonb_build_object(
    'acknowledgements', v_acknowledgements,
    'canConfirm', v_can_confirm,
    'closesAt', v_closes_at
  );
end;
$$;

create or replace function public.plan_meetup_finish_v1(p_actor_id uuid, p_idempotency_key text, p_request_hash text, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  update public.idempotency_records
  set response_status = case when p_body ? 'error' then 409 else 200 end,
      response_body = p_body
  where actor_id = p_actor_id
    and operation = 'plan:meetup:acknowledge'
    and key = p_idempotency_key
    and request_hash = p_request_hash;
  return p_body;
end;
$$;

create or replace function public.plan_meetup_acknowledge_v1(
  p_actor_id uuid,
  p_plan_id uuid,
  p_peer_id uuid,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.idempotency_records%rowtype;
  v_plan public.plans%rowtype;
  v_ack public.plan_meetup_acknowledgements%rowtype;
  v_user_a uuid;
  v_user_b uuid;
  v_is_a boolean;
  v_closes_at timestamptz;
  v_payload jsonb;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_actor_id is null or p_plan_id is null or p_peer_id is null or p_actor_id = p_peer_id
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('error', 'INVALID');
  end if;
  if not public.can_users_interact_v1(p_actor_id, p_peer_id) then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, 'plan:meetup:acknowledge', p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;
  select * into v_stored from public.idempotency_records
  where actor_id = p_actor_id
    and operation = 'plan:meetup:acknowledge'
    and key = p_idempotency_key
  for update;
  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_CONFLICT');
  end if;
  if v_stored.response_body is not null then
    return v_stored.response_body;
  end if;

  v_user_a := least(p_actor_id, p_peer_id);
  v_user_b := greatest(p_actor_id, p_peer_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_plan_id::text || ':' || v_user_a::text || ':' || v_user_b::text, 0)
  );

  select plan.* into v_plan from public.plans plan where plan.id = p_plan_id and public.plan_members_are_adult_v1(plan.id) for update;
  if v_plan.id is null then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'NOT_FOUND'));
  end if;
  if v_plan.status <> 'active' then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'CANCELLED'));
  end if;
  v_closes_at := v_plan.starts_at + interval '48 hours';
  if v_plan.starts_at > pg_catalog.now() then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'MEETUP_NOT_READY'));
  end if;
  if v_closes_at <= pg_catalog.now() then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'MEETUP_CLOSED'));
  end if;
  if not exists (select 1 from public.plan_members where plan_id = p_plan_id and user_id = p_actor_id)
     or not exists (select 1 from public.plan_members where plan_id = p_plan_id and user_id = p_peer_id)
     or not exists (select 1 from public.profiles where id = p_actor_id and deleted_at is null)
     or not exists (select 1 from public.profiles where id = p_peer_id and deleted_at is null)
     or not public.can_users_interact_v1(p_actor_id, p_peer_id) then
    return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, pg_catalog.jsonb_build_object('error', 'NOT_FOUND'));
  end if;

  select * into v_ack from public.plan_meetup_acknowledgements acknowledgement
  where acknowledgement.plan_id = p_plan_id
    and acknowledgement.user_a_id = v_user_a
    and acknowledgement.user_b_id = v_user_b
  for update;
  v_is_a := p_actor_id = v_user_a;
  if v_ack.id is null then
    insert into public.plan_meetup_acknowledgements (
      plan_id, user_a_id, user_b_id, user_a_confirmed_at, user_b_confirmed_at, expires_at
    ) values (
      p_plan_id, v_user_a, v_user_b,
      case when v_is_a then pg_catalog.now() else null end,
      case when v_is_a then null else pg_catalog.now() end,
      v_closes_at
    );
  elsif v_ack.confirmed_at is null then
    update public.plan_meetup_acknowledgements acknowledgement
    set user_a_confirmed_at = case when v_is_a then coalesce(acknowledgement.user_a_confirmed_at, pg_catalog.now()) else acknowledgement.user_a_confirmed_at end,
        user_b_confirmed_at = case when v_is_a then acknowledgement.user_b_confirmed_at else coalesce(acknowledgement.user_b_confirmed_at, pg_catalog.now()) end,
        confirmed_at = case
          when (acknowledgement.user_a_confirmed_at is not null or v_is_a)
           and (acknowledgement.user_b_confirmed_at is not null or not v_is_a)
          then pg_catalog.now()
          else null
        end,
        updated_at = pg_catalog.now()
    where acknowledgement.id = v_ack.id;
  end if;

  v_payload := public.plan_meetup_status_v1(p_actor_id, p_plan_id);
  return public.plan_meetup_finish_v1(p_actor_id, p_idempotency_key, p_request_hash, v_payload);
end;
$$;

create or replace function public.upsert_user_availability(p_user_id uuid, p_activity public.social_activity, p_custom_label text, p_duration_minutes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.user_availabilities;
begin
  perform public.require_adult_social_admission_v1(p_user_id);
  if p_duration_minutes not between 15 and 720 or (p_activity = 'custom' and char_length(btrim(coalesce(p_custom_label, ''))) not between 1 and 48) or (p_activity <> 'custom' and p_custom_label is not null) then
    raise exception 'invalid availability input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and deleted_at is null) then raise exception 'unknown user' using errcode = 'P0002'; end if;
  insert into public.user_availabilities (user_id, activity, custom_label, expires_at)
  values (p_user_id, p_activity, nullif(btrim(p_custom_label), ''), now() + make_interval(mins => p_duration_minutes))
  on conflict (user_id) do update set activity = excluded.activity, custom_label = excluded.custom_label, expires_at = excluded.expires_at, updated_at = now()
  returning * into v_row;
  return jsonb_build_object('availability', public.social_availability_json(v_row));
end $$;

create or replace function public.get_available_people(p_viewer_id uuid, p_limit integer default 20, p_radius_km integer default 25)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_self public.user_availabilities; v_people jsonb;
begin
  perform public.require_adult_social_admission_v1(p_viewer_id);
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

create or replace function public.create_poke(p_sender_id uuid, p_recipient_id uuid, p_activity public.social_activity, p_custom_label text, p_note text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_fingerprint text := concat_ws('|', p_recipient_id, p_activity, coalesce(p_custom_label, ''), coalesce(p_note, '')); v_cached public.social_idempotency_records; v_poke public.pokes;
begin
  perform public.require_adult_social_admission_v1(p_sender_id);
  if p_sender_id <> p_recipient_id and not exists (select 1 from public.profiles where id = p_recipient_id and deleted_at is null) then return jsonb_build_object('error', 'USER_NOT_FOUND'); end if;
  if p_sender_id <> p_recipient_id and not public.can_users_interact_v1(p_sender_id, p_recipient_id) then return jsonb_build_object('error', 'BLOCKED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sender_id::text || ':create_poke:' || p_idempotency_key, 0));
  select * into v_cached from public.social_idempotency_records where actor_id = p_sender_id and operation = 'create_poke' and idempotency_key = p_idempotency_key for update;
  if found then if v_cached.request_fingerprint <> v_fingerprint then return jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED'); end if; return v_cached.response || jsonb_build_object('replayed', true); end if;
  if p_sender_id = p_recipient_id then return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'SELF_TARGET')); end if;
  if exists (select 1 from public.user_blocks where (blocker_id = p_sender_id and blocked_id = p_recipient_id) or (blocker_id = p_recipient_id and blocked_id = p_sender_id)) then return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'BLOCKED')); end if;
  insert into public.pokes (sender_id, recipient_id, activity, custom_label, note) values (p_sender_id, p_recipient_id, p_activity, nullif(btrim(p_custom_label), ''), nullif(btrim(p_note), '')) returning * into v_poke;
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values ('poke.created', 'poke', v_poke.id::text, jsonb_build_object('poke_id', v_poke.id, 'sender_id', v_poke.sender_id, 'recipient_id', v_poke.recipient_id, 'action', 'received'))
  on conflict (event_type, aggregate_id) where event_type = 'poke.created' do nothing;
  return public.social_idempotency_finish(p_sender_id, 'create_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('poke', public.social_poke_json(v_poke), 'replayed', false));
end $$;

create or replace function public.get_active_pokes(p_user_id uuid, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_received jsonb; v_sent jsonb;
begin
  perform public.require_adult_social_admission_v1(p_user_id);
  if p_limit not between 1 and 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  update public.pokes set status = 'expired', responded_at = now() where status = 'pending' and expires_at <= now() and (sender_id = p_user_id or recipient_id = p_user_id);
  select coalesce(jsonb_agg(public.social_poke_json(p) || jsonb_build_object('sender', jsonb_build_object('id', sender.id, 'username', sender.username, 'display_name', sender.display_name, 'avatar_url', sender.avatar_url, 'location_text', sender.location_text, 'is_online', sender.is_online, 'last_seen_at', sender.last_seen_at)) order by p.created_at desc), '[]'::jsonb) into v_received from (select * from public.pokes where recipient_id = p_user_id and status = 'pending' and expires_at > now() and public.can_users_interact_v1(p_user_id, pokes.sender_id) order by created_at desc limit p_limit) p join public.profiles sender on sender.id = p.sender_id and sender.deleted_at is null;
  select coalesce(jsonb_agg(public.social_poke_json(p) || jsonb_build_object('recipient', jsonb_build_object('id', recipient.id, 'username', recipient.username, 'display_name', recipient.display_name, 'avatar_url', recipient.avatar_url, 'location_text', recipient.location_text, 'is_online', recipient.is_online, 'last_seen_at', recipient.last_seen_at)) order by p.created_at desc), '[]'::jsonb) into v_sent from (select * from public.pokes where sender_id = p_user_id and status = 'pending' and expires_at > now() and public.can_users_interact_v1(p_user_id, pokes.recipient_id) order by created_at desc limit p_limit) p join public.profiles recipient on recipient.id = p.recipient_id and recipient.deleted_at is null;
  return jsonb_build_object('received', v_received, 'sent', v_sent);
end $$;

create or replace function public.respond_to_poke(p_recipient_id uuid, p_poke_id uuid, p_action text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_fingerprint text := concat_ws('|', p_poke_id, p_action); v_cached public.social_idempotency_records; v_poke public.pokes; v_thread_id uuid; v_response jsonb;
begin
  perform public.require_adult_social_admission_v1(p_recipient_id);
  if p_action not in ('accept', 'later', 'decline') then raise exception 'invalid action' using errcode = '22023'; end if;
  select * into v_poke from public.pokes where id = p_poke_id and recipient_id = p_recipient_id;
  if found and not public.can_users_interact_v1(p_recipient_id, v_poke.sender_id) then return jsonb_build_object('error', 'BLOCKED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recipient_id::text || ':respond_to_poke:' || p_idempotency_key, 0));
  select * into v_cached from public.social_idempotency_records where actor_id = p_recipient_id and operation = 'respond_to_poke' and idempotency_key = p_idempotency_key for update;
  if found then if v_cached.request_fingerprint <> v_fingerprint then return jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED'); end if; return v_cached.response || jsonb_build_object('replayed', true); end if;
  select * into v_poke from public.pokes where id = p_poke_id and recipient_id = p_recipient_id for update;
  if not found then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'POKE_NOT_FOUND')); end if;
  if exists (select 1 from public.user_blocks where (blocker_id = p_recipient_id and blocked_id = v_poke.sender_id) or (blocker_id = v_poke.sender_id and blocked_id = p_recipient_id)) then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'BLOCKED')); end if;
  if not public.can_users_interact_v1(p_recipient_id, v_poke.sender_id) then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'BLOCKED')); end if;
  if v_poke.status <> 'pending' then return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', case when v_poke.status = 'expired' then 'POKE_EXPIRED' else 'POKE_ALREADY_RESPONDED' end)); end if;
  if v_poke.expires_at <= now() then update public.pokes set status = 'expired', responded_at = now() where id = v_poke.id returning * into v_poke; return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, jsonb_build_object('error', 'POKE_EXPIRED')); end if;
  if p_action = 'accept' then
    -- Existing create_or_find_thread charges coins to initiate a non-friend DM.
    -- A recipient's acceptance is the explicit reciprocal consent that opens this
    -- Poke conversation, so it uses the same pair lock and member trigger without
    -- charging either participant.
    perform pg_advisory_xact_lock(hashtextextended(least(v_poke.sender_id, v_poke.recipient_id)::text || ':' || greatest(v_poke.sender_id, v_poke.recipient_id)::text, 0));
    select id into v_thread_id from public.dm_threads where participant_1_id = least(v_poke.sender_id, v_poke.recipient_id) and participant_2_id = greatest(v_poke.sender_id, v_poke.recipient_id);
    if v_thread_id is null then
      insert into public.dm_threads(participant_1_id, participant_2_id) values (least(v_poke.sender_id, v_poke.recipient_id), greatest(v_poke.sender_id, v_poke.recipient_id)) returning id into v_thread_id;
    end if;
    update public.pokes set status = 'accepted', responded_at = now(), thread_id = v_thread_id where id = v_poke.id returning * into v_poke;
    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('poke.accepted', 'poke', v_poke.id::text, jsonb_build_object('poke_id', v_poke.id, 'sender_id', v_poke.sender_id, 'recipient_id', v_poke.recipient_id, 'thread_id', v_thread_id, 'action', 'accepted'))
    on conflict (event_type, aggregate_id) where event_type = 'poke.accepted' do nothing;
    v_response := jsonb_build_object('poke', public.social_poke_json(v_poke), 'threadId', v_thread_id);
  else
    update public.pokes set status = case when p_action = 'later' then 'later'::public.poke_status else 'declined'::public.poke_status end, responded_at = now() where id = v_poke.id returning * into v_poke;
    v_response := jsonb_build_object('poke', public.social_poke_json(v_poke));
  end if;
  return public.social_idempotency_finish(p_recipient_id, 'respond_to_poke'::text, p_idempotency_key, v_fingerprint, v_response || jsonb_build_object('replayed', false));
end $$;

create or replace function public.clear_user_availability(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_adult_social_admission_v1(p_user_id);
  delete from public.user_availabilities where user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.authorize_poke_delivery(
  p_poke_id uuid, p_action text, p_sender_id uuid, p_recipient_id uuid, p_thread_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_poke public.pokes%rowtype;
begin
  if p_action not in ('received', 'accepted') then raise exception 'invalid Poke delivery action' using errcode = '22023'; end if;
  select * into v_poke from public.pokes where id = p_poke_id;
  if v_poke.id is null or v_poke.sender_id <> p_sender_id or v_poke.recipient_id <> p_recipient_id
     or not public.can_users_interact_v1(p_sender_id, p_recipient_id) then
    return jsonb_build_object('deliver', false);
  end if;
  if p_action = 'received' then return jsonb_build_object('deliver', v_poke.status = 'pending' and v_poke.expires_at > pg_catalog.now()); end if;
  if v_poke.status <> 'accepted' or v_poke.thread_id is null or v_poke.thread_id <> p_thread_id
     or not exists (select 1 from public.dm_thread_members member where member.thread_id = v_poke.thread_id and member.user_id = p_sender_id)
     or not exists (select 1 from public.dm_thread_members member where member.thread_id = v_poke.thread_id and member.user_id = p_recipient_id) then
    return jsonb_build_object('deliver', false);
  end if;
  return jsonb_build_object('deliver', true, 'threadId', v_poke.thread_id);
end;
$$;

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
    and public.can_users_interact_v1(p_viewer_id, p_subject_id)
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

-- Preserve the existing service-role-only exposure model.
revoke all on function public.plan_members_are_adult_v1(uuid), public.plan_is_blocked_v1(uuid, uuid), public.plan_has_blocked_member_v1(uuid, uuid), public.plan_viewable_v1(uuid, public.plans), public.plan_payload_v1(uuid, uuid), public.plan_create_finish_v1(uuid, text, text, jsonb), public.plan_create_v1(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text), public.plan_create_v2(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text, boolean), public.plans_list_v1(uuid), public.plans_list_v2(uuid), public.plan_read_v1(uuid, uuid), public.plan_update_v1(uuid, uuid, jsonb), public.plan_cancel_v1(uuid, uuid), public.plan_join_v1(uuid, uuid, text, text, text), public.plan_join_finish_v1(uuid, text, text, jsonb), public.plan_leave_v1(uuid, uuid), public.plan_share_create_v1(uuid, uuid, timestamptz), public.plan_share_revoke_v1(uuid, uuid), public.plan_public_preview_v1(text), public.plan_meetup_status_v1(uuid, uuid), public.plan_meetup_finish_v1(uuid, text, text, jsonb), public.plan_meetup_acknowledge_v1(uuid, uuid, uuid, text, text), public.upsert_user_availability(uuid, public.social_activity, text, integer), public.clear_user_availability(uuid), public.get_available_people(uuid, integer, integer), public.create_poke(uuid, uuid, public.social_activity, text, text, text), public.get_active_pokes(uuid, integer), public.respond_to_poke(uuid, uuid, text, text), public.authorize_poke_delivery(uuid, text, uuid, uuid, uuid), public.discovery_subject_visible_to_viewer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plan_create_v1(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text), public.plan_create_v2(uuid, text, text, timestamptz, text, text, uuid, smallint, uuid, text, text, boolean), public.plans_list_v1(uuid), public.plans_list_v2(uuid), public.plan_read_v1(uuid, uuid), public.plan_update_v1(uuid, uuid, jsonb), public.plan_cancel_v1(uuid, uuid), public.plan_join_v1(uuid, uuid, text, text, text), public.plan_leave_v1(uuid, uuid), public.plan_share_create_v1(uuid, uuid, timestamptz), public.plan_share_revoke_v1(uuid, uuid), public.plan_public_preview_v1(text), public.plan_meetup_status_v1(uuid, uuid), public.plan_meetup_acknowledge_v1(uuid, uuid, uuid, text, text), public.upsert_user_availability(uuid, public.social_activity, text, integer), public.clear_user_availability(uuid), public.get_available_people(uuid, integer, integer), public.create_poke(uuid, uuid, public.social_activity, text, text, text), public.get_active_pokes(uuid, integer), public.respond_to_poke(uuid, uuid, text, text), public.authorize_poke_delivery(uuid, text, uuid, uuid, uuid), public.discovery_subject_visible_to_viewer(uuid, uuid) to service_role;
-- END AGE PRODUCT

-- BEGIN AGE SOCIAL
-- PROPOSED REVIEW FRAGMENT ONLY. Do not apply directly as a migration.
-- Captured from final repository definitions through migration 20260908125054.
-- Required helpers: public.require_adult_social_admission_v1(uuid) returns void;
-- public.can_users_interact_v1(uuid,uuid) returns boolean for distinct active
-- adult-admitted, unblocked profiles.
-- Inventory: nearby_users_for_user; send/respond friend request; friendship
-- removal; create_or_find_thread; meeting eligibility/recording; mutual meetup
-- acknowledge/read; profile social context.
-- search_users_for_user is intentionally absent: no repository-owned SQL
-- definition exists to capture. Its server route is already withAuth-gated; use
-- the deployed function definition, not an invented replacement, in assembly.

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
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_operation is distinct from 'friend_request:create'
     or p_actor_id is null
     or p_addressee_id is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('response_status', 400, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Invalid idempotency request', 'message', 'Invalid idempotency request', 'code', 'INVALID_IDEMPOTENCY_KEY', 'request_id', null), 'retry_after_seconds', null, 'replayed', false);
  end if;

  if p_actor_id <> p_addressee_id and not public.can_users_interact_v1(p_actor_id, p_addressee_id) then
    return pg_catalog.jsonb_build_object('response_status', 403, 'response_body', pg_catalog.jsonb_build_object('version','v1','error','Cannot send request','message','Cannot send request','code','BLOCKED','request_id',v_safe_request_id), 'retry_after_seconds', null, 'replayed', false);
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
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_operation is distinct from 'friend_request:respond'
     or p_action not in ('accepted', 'declined')
     or p_actor_id is null
     or p_friendship_id is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('response_status', 400, 'response_body', pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Invalid idempotency request', 'message', 'Invalid idempotency request', 'code', 'INVALID_IDEMPOTENCY_KEY', 'request_id', null), 'retry_after_seconds', null, 'replayed', false);
  end if;

  if exists (select 1 from public.friendships friendship where friendship.id = p_friendship_id)
     and not exists (select 1 from public.friendships friendship where friendship.id=p_friendship_id and public.can_users_interact_v1(p_actor_id, case when friendship.requester_id=p_actor_id then friendship.addressee_id else friendship.requester_id end)) then
    return pg_catalog.jsonb_build_object('response_status',404,'response_body',pg_catalog.jsonb_build_object('version','v1','error','Friendship not found','message','Friendship not found','code','FRIENDSHIP_NOT_FOUND','request_id',v_safe_request_id),'retry_after_seconds',null,'replayed',false);
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
  perform public.require_adult_social_admission_v1(p_actor_id);
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

create or replace function public.nearby_users_for_user(p_user_id uuid, p_radius_km double precision default 2)
returns table(user_id uuid, username text, display_name text, avatar_url text, is_online boolean, last_seen_at timestamptz, lat double precision, lng double precision)
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.require_adult_social_admission_v1(p_user_id);
  return query
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
end;
$$;

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
  perform public.require_adult_social_admission_v1(p_user_a);
  if p_user_a = p_user_b then
    return pg_catalog.jsonb_build_object('error', 'SELF_MESSAGE', 'message', 'Cannot message yourself', 'status', 400);
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_user_a and profile.deleted_at is null)
     or not exists (select 1 from public.profiles profile where profile.id = p_user_b and profile.deleted_at is null) then
    return pg_catalog.jsonb_build_object('error', 'USER_NOT_FOUND', 'message', 'User not found', 'status', 404);
  end if;
  if not public.can_users_interact_v1(p_user_a, p_user_b) then return pg_catalog.jsonb_build_object('error','BLOCKED','message','User not found','status',404); end if;
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
  select public.can_users_interact_v1(p_actor_id, p_peer_id) and (exists (
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
  ));
$$;

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
  perform public.require_adult_social_admission_v1(p_user_id);
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id then
    return pg_catalog.jsonb_build_object('error', 'INVALID_USERS', 'message', 'Two different users are required', 'status', 400);
  end if;

  if not public.can_users_interact_v1(p_user_id, p_friend_id) then
    return pg_catalog.jsonb_build_object('error', 'NOT_FRIENDS', 'message', 'Users do not share a confirmed meetup connection', 'status', 400);
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

create or replace function public.acknowledge_meetup_idempotent(
  p_actor_id uuid,
  p_peer_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.idempotency_records%rowtype;
  v_ack public.meetup_acknowledgements%rowtype;
  v_a uuid := least(p_actor_id, p_peer_id);
  v_b uuid := greatest(p_actor_id, p_peer_id);
  v_day date := (pg_catalog.now() at time zone 'UTC')::date;
  v_expires_at timestamptz := date_trunc('day', pg_catalog.now() at time zone 'UTC') + interval '2 days';
  v_is_a boolean;
  v_status text;
  v_confirmed_at timestamptz;
  v_confirmed_transition boolean := false;
  v_body jsonb;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_operation is distinct from 'meetup:acknowledge'
     or p_actor_id is null or p_peer_id is null or p_actor_id = p_peer_id
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('error', 'INVALID_IDEMPOTENCY_KEY');
  end if;

  if not public.can_users_interact_v1(p_actor_id, p_peer_id) then return pg_catalog.jsonb_build_object('error','NOT_ELIGIBLE'); end if;

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
  on conflict (actor_id, operation, key) do nothing;
  select * into v_stored from public.idempotency_records
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key
  for update;
  if v_stored.request_hash is distinct from p_request_hash then
    return pg_catalog.jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
  end if;
  if v_stored.response_body is not null then
    return v_stored.response_body || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_a::text || ':' || v_b::text || ':' || v_day::text, 0));
  if exists (select 1 from public.user_blocks block where (block.blocker_id = p_actor_id and block.blocked_id = p_peer_id) or (block.blocker_id = p_peer_id and block.blocked_id = p_actor_id)) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;
  if not public.meeting_pair_eligible_v1(p_actor_id, p_peer_id) then
    return pg_catalog.jsonb_build_object('error', 'NOT_ELIGIBLE');
  end if;

  select * into v_ack from public.meetup_acknowledgements
  where user_a_id = v_a and user_b_id = v_b and meetup_day = v_day
  for update;
  v_is_a := p_actor_id = v_a;
  if v_ack.id is null then
    insert into public.meetup_acknowledgements (
      user_a_id, user_b_id, meetup_day, user_a_confirmed_at, user_b_confirmed_at, expires_at
    ) values (
      v_a, v_b, v_day,
      case when v_is_a then pg_catalog.now() else null end,
      case when v_is_a then null else pg_catalog.now() end,
      v_expires_at
    ) returning * into v_ack;
  elsif v_ack.confirmed_at is null then
    update public.meetup_acknowledgements
    set user_a_confirmed_at = case when v_is_a then coalesce(user_a_confirmed_at, pg_catalog.now()) else user_a_confirmed_at end,
        user_b_confirmed_at = case when v_is_a then user_b_confirmed_at else coalesce(user_b_confirmed_at, pg_catalog.now()) end,
        confirmed_at = case
          when (user_a_confirmed_at is not null or v_is_a)
           and (user_b_confirmed_at is not null or not v_is_a)
            then pg_catalog.now()
          else null
        end,
        updated_at = pg_catalog.now()
    where id = v_ack.id
    returning * into v_ack;
    v_confirmed_transition := v_ack.confirmed_at is not null;
  end if;

  v_status := case when v_ack.confirmed_at is null then 'waiting' else 'confirmed' end;
  v_confirmed_at := v_ack.confirmed_at;
  v_body := pg_catalog.jsonb_build_object('meetup', pg_catalog.jsonb_build_object(
    'id', v_ack.id, 'peerId', p_peer_id, 'status', v_status,
    'viewerConfirmed', case when v_is_a then v_ack.user_a_confirmed_at is not null else v_ack.user_b_confirmed_at is not null end,
    'expiresAt', v_ack.expires_at, 'confirmedAt', v_confirmed_at
  ), 'replayed', false, 'confirmed_transition', v_confirmed_transition);
  update public.idempotency_records
  set response_status = 200, response_body = v_body
  where actor_id = p_actor_id and operation = p_operation and key = p_idempotency_key;
  return v_body;
end;
$$;

create or replace function public.read_meetup_acknowledgement(
  p_actor_id uuid,
  p_peer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ack public.meetup_acknowledgements%rowtype;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  if p_actor_id is null or p_peer_id is null or p_actor_id = p_peer_id then
    return pg_catalog.jsonb_build_object('error', 'NOT_ELIGIBLE');
  end if;
  if not public.can_users_interact_v1(p_actor_id, p_peer_id) then return pg_catalog.jsonb_build_object('error','NOT_ELIGIBLE'); end if;
  if exists (select 1 from public.user_blocks block where (block.blocker_id = p_actor_id and block.blocked_id = p_peer_id) or (block.blocker_id = p_peer_id and block.blocked_id = p_actor_id)) then
    return pg_catalog.jsonb_build_object('error', 'BLOCKED');
  end if;
  select * into v_ack from public.meetup_acknowledgements acknowledgement
  where acknowledgement.expires_at > pg_catalog.now()
    and ((acknowledgement.user_a_id = p_actor_id and acknowledgement.user_b_id = p_peer_id)
      or (acknowledgement.user_a_id = p_peer_id and acknowledgement.user_b_id = p_actor_id))
  order by acknowledgement.meetup_day desc
  limit 1;
  if v_ack.id is null then
    return pg_catalog.jsonb_build_object('meetup', null);
  end if;
  return pg_catalog.jsonb_build_object('meetup', pg_catalog.jsonb_build_object(
    'id', v_ack.id,
    'peerId', p_peer_id,
    'status', case when v_ack.confirmed_at is null then 'waiting' else 'confirmed' end,
    'viewerConfirmed', case when v_ack.user_a_id = p_actor_id then v_ack.user_a_confirmed_at is not null else v_ack.user_b_confirmed_at is not null end,
    'expiresAt', v_ack.expires_at,
    'confirmedAt', v_ack.confirmed_at
  ));
end;
$$;

create or replace function public.get_profile_social_context(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_availability jsonb;
  v_shared_circles jsonb;
  v_upcoming_plans jsonb;
  v_mutual_meetups bigint;
begin
  perform public.require_adult_social_admission_v1(p_viewer_id);
  if p_viewer_id is null or p_target_id is null
     or not exists (select 1 from public.profiles profile where profile.id = p_viewer_id and profile.deleted_at is null)
     or not exists (select 1 from public.profiles profile where profile.id = p_target_id and profile.deleted_at is null)
     or (p_viewer_id <> p_target_id and not public.can_users_interact_v1(p_viewer_id, p_target_id))
     or exists (
       select 1 from public.user_blocks block
       where (block.blocker_id = p_viewer_id and block.blocked_id = p_target_id)
          or (block.blocker_id = p_target_id and block.blocked_id = p_viewer_id)
     ) then
    return pg_catalog.jsonb_build_object('error', 'NOT_FOUND');
  end if;

  select public.social_availability_json(availability) into v_availability
  from public.user_availabilities availability
  where availability.user_id = p_target_id
    and availability.expires_at > pg_catalog.now()
    and public.discovery_subject_visible_to_viewer(p_viewer_id, p_target_id);

  select coalesce(jsonb_agg(circle.payload order by circle.id), '[]'::jsonb) into v_shared_circles
  from (
    select distinct viewer_circle.group_id as id,
      jsonb_build_object('id', viewer_circle.group_id, 'name', 'Shared group') as payload
    from public.shared_group_members viewer_circle
    join public.shared_group_members target_circle on target_circle.group_id = viewer_circle.group_id
    where viewer_circle.user_id = p_viewer_id
      and target_circle.user_id = p_target_id
    order by viewer_circle.group_id
    limit 6
  ) circle;

  select coalesce(jsonb_agg(plan_context.payload order by plan_context.starts_at, plan_context.id), '[]'::jsonb) into v_upcoming_plans
  from (
    select plan.id, plan.starts_at, public.plan_payload_v1(p_viewer_id, plan.id)->'plan' as payload
    from public.plans plan
    where plan.status = 'active'
      and plan.starts_at > pg_catalog.now()
      and exists (
        select 1 from public.plan_members target_member
        where target_member.plan_id = plan.id and target_member.user_id = p_target_id
      )
      and public.plan_viewable_v1(p_viewer_id, plan)
    order by plan.starts_at, plan.id
    limit 3
  ) plan_context;

  select count(*) into v_mutual_meetups
  from public.meetup_acknowledgements acknowledgement
  where acknowledgement.confirmed_at is not null
    and ((acknowledgement.user_a_id = p_viewer_id and acknowledgement.user_b_id = p_target_id)
      or (acknowledgement.user_a_id = p_target_id and acknowledgement.user_b_id = p_viewer_id));

  return jsonb_build_object(
    'availability', v_availability,
    'sharedCircles', v_shared_circles,
    'upcomingPlans', v_upcoming_plans,
    'mutualMeetups', v_mutual_meetups
  );
end;
$$;

revoke all on function public.send_friend_request_idempotent(uuid,uuid,text,text,text,text), public.respond_friend_request_idempotent(uuid,uuid,text,text,text,text,text), public.friendship_removal_core(uuid,uuid,text), public.nearby_users_for_user(uuid,double precision), public.create_or_find_thread(uuid,uuid), public.meeting_pair_eligible_v1(uuid,uuid), public.record_meeting_for_user(uuid,uuid), public.acknowledge_meetup_idempotent(uuid,uuid,text,text,text), public.read_meetup_acknowledgement(uuid,uuid), public.get_profile_social_context(uuid,uuid) from public, anon, authenticated;
grant execute on function public.send_friend_request_idempotent(uuid,uuid,text,text,text,text), public.respond_friend_request_idempotent(uuid,uuid,text,text,text,text,text), public.friendship_removal_core(uuid,uuid,text), public.nearby_users_for_user(uuid,double precision), public.create_or_find_thread(uuid,uuid), public.meeting_pair_eligible_v1(uuid,uuid), public.record_meeting_for_user(uuid,uuid), public.acknowledge_meetup_idempotent(uuid,uuid,text,text,text), public.read_meetup_acknowledgement(uuid,uuid), public.get_profile_social_context(uuid,uuid) to service_role;
-- END AGE SOCIAL

-- BEGIN AGE DELIVERY
-- Private migration-17 fragment. Assemble after the service-only admission helpers.
-- Existing function ACLs remain intact under CREATE OR REPLACE FUNCTION.

-- Captured authorize_call_invite_delivery(uuid,uuid,uuid,uuid); owner postgres;
-- ACL {postgres=X/postgres,service_role=X/postgres}; original pg_get_functiondef MD5 4ba9de85d945ba86adf30ce741b9ed74.
CREATE OR REPLACE FUNCTION public.authorize_call_invite_delivery(p_call_id uuid, p_thread_id uuid, p_caller_id uuid, p_callee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.call_sessions%rowtype;
begin
  if p_call_id is null or p_thread_id is null or p_caller_id is null
     or p_callee_id is null or p_caller_id = p_callee_id then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_call_id::text, 0)
  );
  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id;
  if not found then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('call-thread:' || v_session.thread_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.caller_id::text else v_session.callee_id::text end,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when v_session.caller_id::text < v_session.callee_id::text then v_session.callee_id::text else v_session.caller_id::text end,
      0
    )
  );

  select session.* into v_session
  from public.call_sessions session
  where session.id = p_call_id
  for update;
  if not found
     or v_session.thread_id <> p_thread_id
     or v_session.caller_id <> p_caller_id
     or v_session.callee_id <> p_callee_id
     or v_session.state <> 'invited'
     or v_session.expires_at <= now() then
    return false;
  end if;

  return exists (
    select 1
    from public.dm_threads thread
    join public.profiles caller on caller.id = p_caller_id
      and caller.deleted_at is null and caller.onboarding_completed is true
    join public.profiles callee on callee.id = p_callee_id
      and callee.deleted_at is null and callee.onboarding_completed is true
    where thread.id = p_thread_id
      and thread.participant_1_id in (p_caller_id, p_callee_id)
      and thread.participant_2_id in (p_caller_id, p_callee_id)
      and public.is_adult_social_admitted_v1(p_caller_id)
      and public.is_adult_social_admitted_v1(p_callee_id)
      and (
        select pg_catalog.count(*)
        from public.dm_thread_members member
        where member.thread_id = p_thread_id
          and member.user_id in (p_caller_id, p_callee_id)
      ) = 2
      and not exists (
        select 1
        from public.user_blocks block
        where (block.blocker_id = p_caller_id and block.blocked_id = p_callee_id)
           or (block.blocker_id = p_callee_id and block.blocked_id = p_caller_id)
      )
  );
end;
$function$;

-- Captured can_deliver_profile_updated_hint(uuid,uuid); owner postgres;
-- ACL {postgres=X/postgres,service_role=X/postgres}; original pg_get_functiondef MD5 6924e1735d71824765f7bf935424f1d5.
CREATE OR REPLACE FUNCTION public.can_deliver_profile_updated_hint(p_profile_id uuid, p_recipient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles source_profile
    join public.profiles recipient_profile
      on recipient_profile.id = p_recipient_id
     and recipient_profile.deleted_at is null
    where source_profile.id = p_profile_id
      and source_profile.deleted_at is null
      and public.is_adult_social_admitted_v1(p_profile_id)
      and public.is_adult_social_admitted_v1(p_recipient_id)
      and (
        p_profile_id = p_recipient_id
        or (
          not exists (
            select 1 from public.user_blocks block
            where (block.blocker_id = p_profile_id and block.blocked_id = p_recipient_id)
               or (block.blocker_id = p_recipient_id and block.blocked_id = p_profile_id)
          )
          and (
            exists (
              select 1 from public.friendships friendship
              where friendship.status in ('pending', 'accepted')
                and friendship.requester_id = p_profile_id
                and friendship.addressee_id = p_recipient_id
            )
            or exists (
              select 1 from public.friendships friendship
              where friendship.status in ('pending', 'accepted')
                and friendship.requester_id = p_recipient_id
                and friendship.addressee_id = p_profile_id
            )
            or exists (
              select 1 from public.dm_threads thread
              where thread.participant_1_id = p_profile_id and thread.participant_2_id = p_recipient_id
            )
            or exists (
              select 1 from public.dm_threads thread
              where thread.participant_1_id = p_recipient_id and thread.participant_2_id = p_profile_id
            )
          )
        )
      )
  )
$function$;

-- Captured claim_shared_group_message_recipients(uuid,uuid[],uuid,text); owner postgres;
-- ACL {postgres=X/postgres,service_role=X/postgres}; original pg_get_functiondef MD5 b22a7f51664210e191c45a0cbe2e1f1a.
CREATE OR REPLACE FUNCTION public.claim_shared_group_message_recipients(p_group_id uuid, p_recipient_ids uuid[], p_event_id uuid, p_worker_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recipient_id uuid;
  v_active_recipients uuid[]:='{}'::uuid[];
  v_profile_id uuid;
  v_sender_id uuid;
  v_claimed integer;
  v_active_count integer:=0;
begin
  if p_group_id is null or p_recipient_ids is null or p_event_id is null or nullif(p_worker_id,'') is null then return pg_catalog.jsonb_build_object('status','empty','recipient_ids','[]'::jsonb); end if;
  select nullif(coalesce(outbox_event.payload->>'sender_id', outbox_event.payload->>'actor_id'), '')::uuid
  into v_sender_id
  from public.outbox_events outbox_event
  where outbox_event.id=p_event_id and outbox_event.status='processing' and outbox_event.locked_by=p_worker_id;
  if not found then return pg_catalog.jsonb_build_object('status','busy','recipient_ids','[]'::jsonb); end if;
  if v_sender_id is null or not public.is_adult_social_admitted_v1(v_sender_id) then return pg_catalog.jsonb_build_object('status','empty','recipient_ids','[]'::jsonb); end if;
  for v_recipient_id in select distinct requested.recipient_id from pg_catalog.unnest(p_recipient_ids) requested(recipient_id) where requested.recipient_id is not null order by requested.recipient_id loop
    v_profile_id:=null;
    select profile.id into v_profile_id from public.profiles profile where profile.id=v_recipient_id and profile.deleted_at is null for update;
    if v_profile_id is null or not public.is_adult_social_admitted_v1(v_recipient_id) or not exists(select 1 from public.shared_group_members member where member.group_id=p_group_id and member.user_id=v_recipient_id) then continue; end if;
    v_active_count:=v_active_count+1;
    if exists(select 1 from public.shared_group_delivery_leases lease where lease.event_id=p_event_id and lease.user_id=v_recipient_id and lease.worker_id<>p_worker_id) then delete from public.shared_group_delivery_leases lease where lease.event_id=p_event_id and lease.worker_id=p_worker_id; return pg_catalog.jsonb_build_object('status','busy','recipient_ids','[]'::jsonb); end if;
    insert into public.shared_group_delivery_leases(event_id,user_id,group_id,worker_id) values(p_event_id,v_recipient_id,p_group_id,p_worker_id) on conflict(event_id,user_id) do update set worker_id=excluded.worker_id where public.shared_group_delivery_leases.worker_id=p_worker_id;
    get diagnostics v_claimed=row_count;
    if v_claimed<>1 then delete from public.shared_group_delivery_leases lease where lease.event_id=p_event_id and lease.worker_id=p_worker_id; return pg_catalog.jsonb_build_object('status','busy','recipient_ids','[]'::jsonb); end if;
    v_active_recipients:=pg_catalog.array_append(v_active_recipients,v_recipient_id);
  end loop;
  if v_active_count=0 then return pg_catalog.jsonb_build_object('status','empty','recipient_ids','[]'::jsonb); end if;
  return pg_catalog.jsonb_build_object('status','claimed','recipient_ids',pg_catalog.to_jsonb(v_active_recipients));
end;
$function$;
-- END AGE DELIVERY

-- BEGIN AGE RLS
-- Additive restrictive policies intersect the existing authorization rules.
-- They never turn a denied row into an allowed row and do not widen grants.
-- Own profile reads, role metadata, and public interest tags remain available
-- for authentication/bootstrap. Profile writes still require adult admission.
create function app_private.current_account_is_adult_v1()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_adult_social_admitted_v1((select auth.uid()));
$$;

create function app_private.social_subject_is_adult_v1(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_adult_social_admitted_v1(p_user_id);
$$;

revoke all on function app_private.current_account_is_adult_v1(),
  app_private.social_subject_is_adult_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.current_account_is_adult_v1(),
  app_private.social_subject_is_adult_v1(uuid)
  to authenticated;

create policy "adult admission profile insert" on public.profiles
  as restrictive for insert to authenticated
  with check ((select app_private.current_account_is_adult_v1()));
create policy "adult admission profile update" on public.profiles
  as restrictive for update to authenticated
  using ((select app_private.current_account_is_adult_v1()))
  with check ((select app_private.current_account_is_adult_v1()));

create policy "adult admission profile interests" on public.profile_interests
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()))
  with check ((select app_private.current_account_is_adult_v1()));
create policy "adult admission profile photos" on public.profile_photos
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_id));

create policy "adult admission friendships" on public.friendships
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(requester_id) and app_private.social_subject_is_adult_v1(addressee_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(requester_id) and app_private.social_subject_is_adult_v1(addressee_id));
create policy "adult admission meetings" on public.friend_meetings
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_a_id) and app_private.social_subject_is_adult_v1(user_b_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_a_id) and app_private.social_subject_is_adult_v1(user_b_id));

create policy "adult admission dm threads" on public.dm_threads
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(participant_1_id) and app_private.social_subject_is_adult_v1(participant_2_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(participant_1_id) and app_private.social_subject_is_adult_v1(participant_2_id));
create policy "adult admission dm messages" on public.dm_messages
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.can_access_dm_thread(thread_id::text))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.can_access_dm_thread(thread_id::text));

create policy "adult admission chat rooms" on public.chat_rooms
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()))
  with check ((select app_private.current_account_is_adult_v1()));
create policy "adult admission chat members" on public.chat_room_members
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(user_id));
create policy "adult admission chat messages" on public.chat_room_messages
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(sender_id))
  with check ((select app_private.current_account_is_adult_v1()) and app_private.social_subject_is_adult_v1(sender_id));

create policy "adult admission realtime" on realtime.messages
  as restrictive for all to authenticated
  using ((select app_private.current_account_is_adult_v1()))
  with check ((select app_private.current_account_is_adult_v1()));
-- END AGE RLS
