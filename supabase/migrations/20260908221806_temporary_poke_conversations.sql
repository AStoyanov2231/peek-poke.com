-- Temporary Poke conversations preserve readable history.
-- New interactions expire after 24 hours; accepted friendship remains ongoing.
create index pokes_accepted_thread_time_idx on public.pokes (thread_id, responded_at desc)
where status = 'accepted';

create function app_private.dm_conversation_expires_at_v1(p_thread_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.friendships friendship
    where friendship.status = 'accepted'
      and ((friendship.requester_id = thread.participant_1_id and friendship.addressee_id = thread.participant_2_id)
        or (friendship.requester_id = thread.participant_2_id and friendship.addressee_id = thread.participant_1_id))
  ) then null::timestamptz else (
    select max(poke.responded_at) + interval '24 hours'
    from public.pokes poke where poke.thread_id = thread.id and poke.status = 'accepted'
  ) end
  from public.dm_threads thread where thread.id = p_thread_id;
$$;
revoke all on function app_private.dm_conversation_expires_at_v1(uuid) from public, anon, authenticated, service_role;

create function public.read_dm_conversation_facts_v1(p_actor_id uuid, p_thread_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_thread public.dm_threads%rowtype;
  v_peer_id uuid;
  v_friendship boolean;
  v_accepted_at timestamptz;
begin
  perform public.require_adult_social_admission_v1(p_actor_id);
  select * into v_thread from public.dm_threads
    where id = p_thread_id and p_actor_id in (participant_1_id, participant_2_id);
  if not found then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  v_peer_id := case when v_thread.participant_1_id = p_actor_id then v_thread.participant_2_id else v_thread.participant_1_id end;
  if not public.can_users_interact_v1(p_actor_id, v_peer_id) then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;
  select exists (select 1 from public.friendships friendship where friendship.status = 'accepted'
    and ((friendship.requester_id = p_actor_id and friendship.addressee_id = v_peer_id)
      or (friendship.requester_id = v_peer_id and friendship.addressee_id = p_actor_id))) into v_friendship;
  select max(responded_at) into v_accepted_at from public.pokes where thread_id = p_thread_id and status = 'accepted';
  return jsonb_build_object('friendship_accepted', v_friendship, 'latest_poke_accepted_at', v_accepted_at, 'server_now', clock_timestamp());
end;
$$;
revoke all on function public.read_dm_conversation_facts_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_dm_conversation_facts_v1(uuid,uuid) to service_role;

create function app_private.enforce_dm_conversation_window_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_expires_at timestamptz;
begin
  -- Trusted server-generated call summaries remain possible after a call ends.
  -- The message-create API never accepts system messages from clients.
  if tg_op = 'INSERT' and new.message_type::text = 'system' then return new; end if;
  if tg_op = 'UPDATE' then
    -- Retained-history receipts and deletion do not start a new interaction.
    if new.is_deleted then return new; end if;
    if new.content is not distinct from old.content
      and new.message_type is not distinct from old.message_type
      and new.media_url is not distinct from old.media_url
      and new.media_thumbnail_url is not distinct from old.media_thumbnail_url
      and new.reply_to_id is not distinct from old.reply_to_id
      and new.is_deleted is not distinct from old.is_deleted then return new; end if;
  end if;
  v_expires_at := app_private.dm_conversation_expires_at_v1(new.thread_id);
  if v_expires_at is not null and v_expires_at <= clock_timestamp() then
    raise exception 'POKE_CONVERSATION_EXPIRED' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_dm_conversation_window_v1() from public, anon, authenticated, service_role;
create trigger dm_messages_conversation_window_v1 before insert or update on public.dm_messages
for each row execute function app_private.enforce_dm_conversation_window_v1();

create function app_private.enforce_new_call_conversation_window_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_expires_at timestamptz;
begin
  v_expires_at := app_private.dm_conversation_expires_at_v1(new.thread_id);
  if v_expires_at is not null and v_expires_at <= clock_timestamp() then
    raise exception 'POKE_CONVERSATION_EXPIRED' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_new_call_conversation_window_v1() from public, anon, authenticated, service_role;
create trigger call_sessions_conversation_window_v1 before insert on public.call_sessions
for each row execute function app_private.enforce_new_call_conversation_window_v1();

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
     or v_session.expires_at <= now()
     or app_private.dm_conversation_expires_at_v1(p_thread_id) <= clock_timestamp() then
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

-- Match the existing partial call-invitation index when enqueueing a new call.
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
    ) on conflict (event_type, aggregate_id) where event_type = 'call.invite' do nothing;
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
$function$
;
