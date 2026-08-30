do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regprocedure('public.record_meeting(uuid,uuid)') is null
     or pg_catalog.to_regprocedure('public.record_meeting_for_user(uuid,uuid)') is null then
    raise exception 'durable workflows and record_meeting_for_user must be applied first';
  end if;
end;
$$;

-- Both historical meeting entry points are backend implementation details.
-- In particular, record_meeting predates authoritative proximity validation.
revoke all on function public.record_meeting(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_meeting(uuid, uuid) to service_role;
revoke all on function public.record_meeting_for_user(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_meeting_for_user(uuid, uuid) to service_role;

create unique index if not exists outbox_events_coin_meeting_awarded_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'coin.meeting_awarded';

create or replace function public.record_meeting_idempotent(
  p_actor_id uuid,
  p_friend_id uuid,
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
  v_meeting jsonb;
  v_meeting_id uuid;
  v_canonical_a uuid := pg_catalog.least(p_actor_id, p_friend_id);
  v_canonical_b uuid := pg_catalog.greatest(p_actor_id, p_friend_id);
  v_error_code text;
begin
  if p_operation is distinct from 'coin_meeting:record'
     or p_actor_id is null
     or p_friend_id is null
     or p_actor_id = p_friend_id
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

  insert into public.idempotency_records (actor_id, operation, key, request_hash)
  values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
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
    raise exception 'meeting idempotency claim is unavailable';
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
  if v_claimed <> 1 then
    raise exception 'incomplete meeting idempotency claim is unavailable';
  end if;

  -- This existing core validates accepted friendship, both server-side
  -- locations and their freshness, the authoritative 50 m radius, locks both
  -- wallets in UUID order, and uniquely inserts the canonical meeting pair.
  v_meeting := public.record_meeting_for_user(p_actor_id, p_friend_id);

  if v_meeting ->> 'error' is not null then
    v_error_code := v_meeting ->> 'error';
    if v_error_code = 'INVALID_USERS' then
      v_response_status := 400;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Invalid meeting participants', 'message', 'Invalid meeting participants', 'code', v_error_code, 'request_id', v_safe_request_id);
    elsif v_error_code = 'NOT_FRIENDS' then
      v_response_status := 400;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Users are not friends', 'message', 'Users are not friends', 'code', v_error_code, 'request_id', v_safe_request_id);
    elsif v_error_code = 'LOCATION_STALE' then
      v_response_status := 409;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Location data is stale', 'message', 'Location data is stale', 'code', v_error_code, 'request_id', v_safe_request_id);
    elsif v_error_code = 'TOO_FAR' then
      v_response_status := 409;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Users are too far apart', 'message', 'Users are too far apart', 'code', v_error_code, 'request_id', v_safe_request_id);
    elsif v_error_code = 'WALLET_NOT_FOUND' then
      v_response_status := 409;
      v_response_body := pg_catalog.jsonb_build_object('version', 'v1', 'error', 'Coin wallet not found', 'message', 'Coin wallet not found', 'code', v_error_code, 'request_id', v_safe_request_id);
    else
      raise exception 'invalid meeting core error';
    end if;
  elsif (v_meeting ->> 'success')::boolean is true
      and (v_meeting ->> 'already_met')::boolean is true then
    v_response_status := 200;
    v_response_body := pg_catalog.jsonb_build_object(
      'success', true,
      'awarded', false,
      'already_met', true,
      'balance', null
    );
  elsif (v_meeting ->> 'success')::boolean is true
      and (v_meeting ->> 'already_met')::boolean is false
      and pg_catalog.jsonb_typeof(v_meeting -> 'awarded') = 'boolean'
      and pg_catalog.jsonb_typeof(v_meeting -> 'balance_user') = 'number'
      and pg_catalog.jsonb_typeof(v_meeting -> 'balance_friend') = 'number'
      and (v_meeting ->> 'balance_user')::integer >= 0
      and (v_meeting ->> 'balance_friend')::integer >= 0 then
    v_response_status := 200;
    v_response_body := pg_catalog.jsonb_build_object(
      'success', true,
      'awarded', (v_meeting ->> 'awarded')::boolean,
      'already_met', false,
      'balance', (v_meeting ->> 'balance_user')::integer
    );
  else
    raise exception 'invalid meeting core response';
  end if;

  if v_response_status = 200
     and (v_response_body ->> 'already_met')::boolean is false then
    select meeting.id
    into v_meeting_id
    from public.friend_meetings meeting
    where pg_catalog.least(meeting.user_a_id, meeting.user_b_id) = v_canonical_a
      and pg_catalog.greatest(meeting.user_a_id, meeting.user_b_id) = v_canonical_b;
    if v_meeting_id is null then
      raise exception 'new meeting row is unavailable';
    end if;

    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'coin.meeting_awarded',
      'friend_meeting',
      v_meeting_id::text,
      pg_catalog.jsonb_build_object(
        'meeting_id', v_meeting_id,
        'user_a_id', v_canonical_a,
        'user_b_id', v_canonical_b,
        'action', 'meeting_awarded'
      )
    )
    on conflict (event_type, aggregate_id)
    where event_type = 'coin.meeting_awarded'
    do nothing;
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

revoke all on function public.record_meeting_idempotent(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_meeting_idempotent(
  uuid, uuid, text, text, text, text
) to service_role;
