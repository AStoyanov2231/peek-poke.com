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
