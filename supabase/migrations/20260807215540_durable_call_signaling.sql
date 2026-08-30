do $$
begin
  if pg_catalog.to_regclass('public.dm_threads') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.user_blocks') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.dm_thread_members') is null
     or pg_catalog.to_regclass('realtime.messages') is null
     or pg_catalog.to_regprocedure('app_private.can_access_dm_thread(text)') is null then
    raise exception 'Hosted baseline, durable workflows, and DM membership migrations must be applied first';
  end if;
end;
$$;

create table public.call_sessions (
  id uuid primary key,
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  capability uuid not null default gen_random_uuid(),
  state text not null default 'invited'
    check (state in ('invited', 'accepted', 'negotiating', 'connected', 'rejected', 'cancelled', 'ended')),
  last_sequence bigint not null default 1 check (last_sequence > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caller_id <> callee_id),
  unique (id, thread_id),
  unique (id, capability)
);

create index call_sessions_participant_expiry_idx
  on public.call_sessions (caller_id, expires_at desc);
create index call_sessions_callee_expiry_idx
  on public.call_sessions (callee_id, expires_at desc);
create index call_sessions_expiry_idx
  on public.call_sessions (expires_at)
  where state not in ('rejected', 'cancelled', 'ended');
create index call_sessions_terminal_cleanup_idx
  on public.call_sessions (updated_at)
  where state in ('rejected', 'cancelled', 'ended');

create table public.call_signal_commands (
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  command_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('invite', 'cancel', 'accept', 'reject', 'offer', 'answer', 'ice', 'end', 'heartbeat')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  sequence bigint not null check (sequence > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (call_id, command_id),
  unique (call_id, sequence),
  check (sender_id <> recipient_id)
);

create index call_signal_commands_expiry_idx
  on public.call_signal_commands (expires_at);

alter table public.call_sessions enable row level security;
alter table public.call_signal_commands enable row level security;

create policy "call sessions are server only"
  on public.call_sessions for all to authenticated
  using (false) with check (false);
create policy "call signal commands are server only"
  on public.call_signal_commands for all to authenticated
  using (false) with check (false);

revoke all on public.call_sessions from public, anon, authenticated;
revoke all on public.call_signal_commands from public, anon, authenticated;
grant all on public.call_sessions to service_role;
grant all on public.call_signal_commands to service_role;

-- A block is the authoritative pair fence for calls as well as friendships.
-- The trigger takes the same stable per-user locks as call creation before it
-- terminalizes every active session, so a concurrent invite either observes
-- the block or is ended by the blocker transaction.
create or replace function app_private.terminate_calls_after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when new.blocker_id::text < new.blocked_id::text then new.blocker_id::text else new.blocked_id::text end,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'call-user:' || case when new.blocker_id::text < new.blocked_id::text then new.blocked_id::text else new.blocker_id::text end,
      0
    )
  );

  update public.call_sessions session
  set state = 'ended', expires_at = now(), updated_at = now()
  where session.state in ('invited', 'accepted', 'negotiating', 'connected')
    and new.blocker_id in (session.caller_id, session.callee_id)
    and new.blocked_id in (session.caller_id, session.callee_id);
  return new;
end;
$$;

revoke all on function app_private.terminate_calls_after_block()
  from public, anon, authenticated;
drop trigger if exists terminate_calls_after_block on public.user_blocks;
create trigger terminate_calls_after_block
after insert on public.user_blocks
for each row execute function app_private.terminate_calls_after_block();

-- Soft deletion or revoking onboarding also fences call creation and closes
-- existing sessions. Hard deletion remains covered by the session FKs.
create or replace function app_private.terminate_calls_for_inactive_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The profile row is already locked before a row trigger runs. Never wait on
  -- the call-user lock here: a concurrent call FK may be waiting on this row.
  -- The terminal update plus every command/delivery live-profile recheck keeps
  -- the mutation fail closed without introducing that cycle.
  perform pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('call-user:' || new.id::text, 0)
  );
  update public.call_sessions session
  set state = 'ended', expires_at = now(), updated_at = now()
  where session.state in ('invited', 'accepted', 'negotiating', 'connected')
    and new.id in (session.caller_id, session.callee_id);
  return new;
end;
$$;

revoke all on function app_private.terminate_calls_for_inactive_profile()
  from public, anon, authenticated;
drop trigger if exists terminate_calls_for_inactive_profile on public.profiles;
create trigger terminate_calls_for_inactive_profile
before update of deleted_at, onboarding_completed on public.profiles
for each row
when (
  (old.deleted_at is null and new.deleted_at is not null)
  or (old.onboarding_completed is true and new.onboarding_completed is not true)
)
execute function app_private.terminate_calls_for_inactive_profile();

-- Removing either materialized thread member closes its sessions. Do not wait
-- on the call-thread advisory lock from this row trigger: a cascading thread
-- delete already owns the referenced thread row, while a concurrent call FK
-- may be waiting for that row. Command and delivery membership checks provide
-- the fail-closed fence for the remaining race window.
create or replace function app_private.terminate_calls_for_removed_thread_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.call_sessions session
  set state = 'ended', expires_at = now(), updated_at = now()
  where session.thread_id = old.thread_id
    and session.state in ('invited', 'accepted', 'negotiating', 'connected');
  return old;
end;
$$;

revoke all on function app_private.terminate_calls_for_removed_thread_member()
  from public, anon, authenticated;
drop trigger if exists terminate_calls_for_removed_thread_member on public.dm_thread_members;
create trigger terminate_calls_for_removed_thread_member
before delete on public.dm_thread_members
for each row execute function app_private.terminate_calls_for_removed_thread_member();

create or replace function public.begin_call_session(
  p_call_id uuid,
  p_thread_id uuid,
  p_actor_id uuid,
  p_command_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.dm_threads%rowtype;
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_callee_id uuid;
  v_replayed boolean := false;
begin
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
$$;

create or replace function public.advance_call_session(
  p_call_id uuid,
  p_thread_id uuid,
  p_actor_id uuid,
  p_capability uuid,
  p_command_id uuid,
  p_event_type text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_recipient_id uuid;
  v_event_expires_at timestamptz;
  v_replayed boolean := false;
begin
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

  if not exists (
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
$$;

-- A caller may lose the invite acknowledgement after the server has already
-- committed and broadcast it. Recover cancellation from the original invite
-- identity, without exposing or trusting a client-supplied capability.
create or replace function public.recover_cancel_call_session(
  p_call_id uuid,
  p_thread_id uuid,
  p_actor_id uuid,
  p_command_id uuid,
  p_invite_command_id uuid,
  p_invite_payload_hash text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.call_sessions%rowtype;
  v_command public.call_signal_commands%rowtype;
  v_invite public.call_signal_commands%rowtype;
  v_event_expires_at timestamptz;
  v_replayed boolean := false;
begin
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

  if not exists (
    select 1
    from public.dm_threads thread
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
  ) then
    raise exception 'Call is no longer allowed' using errcode = '42501';
  end if;

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
$$;

create or replace function public.authorize_call_invite_delivery(
  p_call_id uuid,
  p_thread_id uuid,
  p_caller_id uuid,
  p_callee_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.begin_call_session(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.advance_call_session(uuid, uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.recover_cancel_call_session(uuid, uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.authorize_call_invite_delivery(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_call_session(uuid, uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.advance_call_session(uuid, uuid, uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.recover_cancel_call_session(uuid, uuid, uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.authorize_call_invite_delivery(uuid, uuid, uuid, uuid)
  to service_role;

drop policy if exists "authenticated realtime topic write" on realtime.messages;
drop policy if exists "authenticated scoped realtime write" on realtime.messages;
revoke insert, update, delete on realtime.messages from anon, authenticated;

drop policy if exists "authenticated realtime topic read" on realtime.messages;
drop policy if exists "authenticated user sync topic read" on realtime.messages;
drop policy if exists "authenticated scoped realtime read" on realtime.messages;
create policy "authenticated scoped realtime read"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'sync:user:' || (select auth.uid())::text
    or (select realtime.topic()) = 'calls:user:' || (select auth.uid())::text
    or (
      (
        (select realtime.topic()) like 'call:%'
        or (select realtime.topic()) like 'thread:%'
      )
      and app_private.can_access_dm_thread(
        split_part((select realtime.topic()), ':', 2)
      )
    )
  );
