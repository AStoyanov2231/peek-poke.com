create table if not exists public.dm_thread_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_sequence bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.dm_thread_members
  add column if not exists last_read_sequence bigint,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists dm_thread_members_user_thread_idx
  on public.dm_thread_members (user_id, thread_id);

create or replace function public.repair_dm_thread_member_cursors(
  p_thread_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes bigint;
begin
  if exists (
    select 1
    from public.dm_thread_members member
    left join public.dm_threads thread on thread.id = member.thread_id
    where (p_thread_id is null or member.thread_id = p_thread_id)
      and (
        thread.id is null
        or member.user_id not in (thread.participant_1_id, thread.participant_2_id)
        or (
          member.last_read_sequence is not null
          and (
            member.last_read_sequence < 0
            or member.last_read_sequence > coalesce(thread.next_message_sequence, 0)
          )
        )
      )
  ) then
    raise exception 'dm_thread_members contains invalid ownership or cursor state'
      using errcode = '23514';
  end if;

  -- Derive the safe cursor from real history: own messages never make a cursor
  -- unread, and the earliest unread incoming message bounds the read prefix.
  insert into public.dm_thread_members (
    thread_id,
    user_id,
    last_read_sequence
  )
  select
    thread.id,
    participant.user_id,
    greatest(
      0::bigint,
      least(
        coalesce(thread.next_message_sequence, 0),
        coalesce((
          select min(message.sequence) - 1
          from public.dm_messages message
          where message.thread_id = thread.id
            and message.sender_id <> participant.user_id
            and message.is_read = false
        ), coalesce(thread.next_message_sequence, 0))
      )
    )
  from public.dm_threads thread
  cross join lateral (
    values (thread.participant_1_id), (thread.participant_2_id)
  ) participant(user_id)
  where p_thread_id is null or thread.id = p_thread_id
  on conflict (thread_id, user_id) do update
  set
    last_read_sequence = greatest(
      coalesce(dm_thread_members.last_read_sequence, excluded.last_read_sequence),
      excluded.last_read_sequence
    ),
    updated_at = now()
  where dm_thread_members.last_read_sequence is null
     or dm_thread_members.last_read_sequence < excluded.last_read_sequence;

  get diagnostics v_changes = row_count;

  if exists (
    select 1
    from public.dm_threads thread
    where (p_thread_id is null or thread.id = p_thread_id)
      and (
        thread.participant_1_id = thread.participant_2_id
        or (
          select count(*)
          from public.dm_thread_members member
          where member.thread_id = thread.id
        ) <> 2
        or not exists (
          select 1
          from public.dm_thread_members member
          where member.thread_id = thread.id
            and member.user_id = thread.participant_1_id
            and member.last_read_sequence is not null
        )
        or not exists (
          select 1
          from public.dm_thread_members member
          where member.thread_id = thread.id
            and member.user_id = thread.participant_2_id
            and member.last_read_sequence is not null
        )
      )
  ) then
    raise exception 'dm_thread_members coverage is incomplete or ambiguous'
      using errcode = '23514';
  end if;

  return v_changes;
end;
$$;

select public.repair_dm_thread_member_cursors();

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.dm_thread_members'::regclass
      and constraint_record.conname = 'dm_thread_members_last_read_nonnegative'
  ) then
    alter table public.dm_thread_members
      add constraint dm_thread_members_last_read_nonnegative
      check (last_read_sequence >= 0) not valid;
  end if;
end;
$constraint$;

alter table public.dm_thread_members
  validate constraint dm_thread_members_last_read_nonnegative;
alter table public.dm_thread_members
  alter column thread_id set not null,
  alter column user_id set not null,
  alter column last_read_sequence set default 0,
  alter column last_read_sequence set not null;

create or replace function public.enforce_dm_thread_member_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_message_sequence bigint;
begin
  select thread.next_message_sequence
  into v_next_message_sequence
  from public.dm_threads thread
  where thread.id = new.thread_id
    and new.user_id in (thread.participant_1_id, thread.participant_2_id);

  if not found then
    raise exception 'DM cursor owner is not a thread participant'
      using errcode = '23503';
  end if;
  if new.last_read_sequence < 0
     or new.last_read_sequence > coalesce(v_next_message_sequence, 0) then
    raise exception 'DM cursor is outside the durable thread sequence'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_dm_thread_member_invariant_before_write
  on public.dm_thread_members;
create trigger enforce_dm_thread_member_invariant_before_write
before insert or update of thread_id, user_id, last_read_sequence
on public.dm_thread_members
for each row execute function public.enforce_dm_thread_member_invariant();

create or replace function public.enforce_dm_thread_participants_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.participant_1_id = new.participant_2_id then
    raise exception 'DM thread participants must be distinct'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.participant_1_id is distinct from old.participant_1_id
       or new.participant_2_id is distinct from old.participant_2_id then
      raise exception 'DM thread participants are immutable'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_dm_thread_participants_before_write on public.dm_threads;
create trigger enforce_dm_thread_participants_before_write
before insert or update of participant_1_id, participant_2_id
on public.dm_threads
for each row execute function public.enforce_dm_thread_participants_immutable();

create or replace function public.add_dm_thread_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dm_thread_members (
    thread_id,
    user_id,
    last_read_sequence
  )
  values
    (new.id, new.participant_1_id, 0),
    (new.id, new.participant_2_id, 0)
  on conflict (thread_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists add_dm_thread_members_after_insert on public.dm_threads;
create trigger add_dm_thread_members_after_insert
after insert on public.dm_threads
for each row execute function public.add_dm_thread_members();

alter table public.dm_thread_members enable row level security;
drop policy if exists "dm thread members are server only" on public.dm_thread_members;
create policy "dm thread members are server only"
  on public.dm_thread_members
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_thread_members from anon, authenticated;
grant all on public.dm_thread_members to service_role;
revoke all on function public.repair_dm_thread_member_cursors(uuid) from public, anon, authenticated;
grant execute on function public.repair_dm_thread_member_cursors(uuid) to service_role;
revoke all on function public.enforce_dm_thread_member_invariant() from public, anon, authenticated;
revoke all on function public.enforce_dm_thread_participants_immutable() from public, anon, authenticated;
revoke all on function public.add_dm_thread_members() from public, anon, authenticated;

create or replace function public.mark_thread_read_sequence(
  p_thread_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_last_read_sequence bigint;
begin
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
$$;

revoke all on function public.mark_thread_read_sequence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_thread_read_sequence(uuid, uuid)
  to service_role;
