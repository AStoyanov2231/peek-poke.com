-- Public profile cache convergence is driven by the durable outbox. The row
-- trigger commits the sanitized source event in the same transaction as the
-- profile change; the worker expands it into replay-safe per-recipient hints.

do $migration$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.friendships') is null
     or pg_catalog.to_regclass('public.dm_threads') is null
     or pg_catalog.to_regclass('public.user_blocks') is null
     or pg_catalog.to_regclass('public.outbox_events') is null then
    raise exception 'Durable profile fanout requires profiles, friendships, dm_threads, user_blocks, and outbox_events';
  end if;
end
$migration$;

-- Live-profile and block predicates use the baseline profiles_pkey and
-- user_blocks_blocker_id_blocked_id_key indexes. DM expansion uses
-- dm_threads_participant_1_last_message_cursor_idx and
-- dm_threads_participant_2_last_message_cursor_idx from
-- 20260730120000_shared_api_contract_indexes.sql; the baseline participant
-- pair index dm_threads_participants_unique covers the exact delivery
-- membership check. Friendship fanout is
-- the missing two-way pair lookup: keep both orientations covered and exclude
-- statuses that can never receive a hint.
create index if not exists friendships_profile_fanout_requester_idx
  on public.friendships (requester_id, addressee_id)
  where status in ('pending', 'accepted');

create index if not exists friendships_profile_fanout_addressee_idx
  on public.friendships (addressee_id, requester_id)
  where status in ('pending', 'accepted');

create unique index if not exists outbox_events_profile_hint_recipient_uidx
  on public.outbox_events (
    (payload ->> 'source_event_id'),
    (payload ->> 'recipient_id')
  )
  where event_type = 'profile.updated.hint';

create unique index if not exists outbox_events_profile_page_cursor_uidx
  on public.outbox_events (
    (payload ->> 'source_event_id'),
    (payload ->> 'after_recipient_id')
  )
  where event_type = 'profile.updated.page';

create or replace function app_private.enqueue_profile_updated_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'profile.updated',
    'profile',
    new.id::text,
    pg_catalog.jsonb_build_object('profile_id', new.id)
  );
  return new;
end
$function$;

revoke all on function app_private.enqueue_profile_updated_event()
  from public, anon, authenticated;

drop trigger if exists enqueue_profile_updated_after_public_change
  on public.profiles;
create trigger enqueue_profile_updated_after_public_change
after update of username, display_name, bio, avatar_url, cover_image_url, location_text
on public.profiles
for each row
when (
  old.deleted_at is null
  and new.deleted_at is null
  and
  (old.username, old.display_name, old.bio, old.avatar_url, old.cover_image_url, old.location_text)
  is distinct from
  (new.username, new.display_name, new.bio, new.avatar_url, new.cover_image_url, new.location_text)
)
execute function app_private.enqueue_profile_updated_event();

create or replace function public.expand_profile_updated_event(
  p_event_id uuid,
  p_worker_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_source_event_id uuid;
  v_after_recipient_id uuid;
  v_recipient_page uuid[];
  v_inserted integer;
begin
  if nullif(p_worker_id, '') is null then
    raise exception 'Invalid profile fanout worker';
  end if;

  select
    nullif(event.payload ->> 'profile_id', '')::uuid,
    coalesce(nullif(event.payload ->> 'source_event_id', '')::uuid, event.id),
    nullif(event.payload ->> 'after_recipient_id', '')::uuid
  into v_profile_id, v_source_event_id, v_after_recipient_id
  from public.outbox_events event
  where event.id = p_event_id
    and event.event_type in ('profile.updated', 'profile.updated.page')
    and event.status = 'processing'
    and event.locked_by = p_worker_id
    and event.aggregate_id = event.payload ->> 'profile_id';

  if v_profile_id is null then
    raise exception 'Profile fanout source event is missing or not owned by this worker';
  end if;

  with candidates(recipient_id) as (
    select v_profile_id
    union
    select friendship.addressee_id
    from public.friendships friendship
    where friendship.status in ('pending', 'accepted')
      and friendship.requester_id = v_profile_id
    union
    select friendship.requester_id
    from public.friendships friendship
    where friendship.status in ('pending', 'accepted')
      and friendship.addressee_id = v_profile_id
    union
    select thread.participant_2_id
    from public.dm_threads thread
    where thread.participant_1_id = v_profile_id
    union
    select thread.participant_1_id
    from public.dm_threads thread
    where thread.participant_2_id = v_profile_id
  ), recipients(recipient_id) as (
    select candidate.recipient_id
    from candidates candidate
    join public.profiles recipient_profile
      on recipient_profile.id = candidate.recipient_id
     and recipient_profile.deleted_at is null
    where candidate.recipient_id = v_profile_id
       or not exists (
         select 1
         from public.user_blocks block
         where (
           block.blocker_id = v_profile_id
           and block.blocked_id = candidate.recipient_id
         ) or (
           block.blocker_id = candidate.recipient_id
           and block.blocked_id = v_profile_id
         )
       )
  )
  select pg_catalog.array_agg(page.recipient_id order by page.recipient_id)
  into v_recipient_page
  from (
    select recipient.recipient_id
    from recipients recipient
    where recipient.recipient_id is not null
      and (
        v_after_recipient_id is null
        or recipient.recipient_id > v_after_recipient_id
      )
    order by recipient.recipient_id
    limit 101
  ) page;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  select
    'profile.updated.hint',
    'profile_hint',
    recipient.recipient_id::text,
    pg_catalog.jsonb_build_object(
      'source_event_id', v_source_event_id,
      'profile_id', v_profile_id,
      'recipient_id', recipient.recipient_id
    )
  from pg_catalog.unnest(v_recipient_page[1:100]) recipient(recipient_id)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if pg_catalog.coalesce(pg_catalog.array_length(v_recipient_page, 1), 0) > 100 then
    insert into public.outbox_events (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'profile.updated.page',
      'profile',
      v_profile_id::text,
      pg_catalog.jsonb_build_object(
        'source_event_id', v_source_event_id,
        'profile_id', v_profile_id,
        'after_recipient_id', v_recipient_page[100]
      )
    )
    on conflict do nothing;
  end if;

  return v_inserted;
end
$function$;

create or replace function public.can_deliver_profile_updated_hint(
  p_profile_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles source_profile
    join public.profiles recipient_profile
      on recipient_profile.id = p_recipient_id
     and recipient_profile.deleted_at is null
    where source_profile.id = p_profile_id
      and source_profile.deleted_at is null
      and (
        p_profile_id = p_recipient_id
        or (
          not exists (
            select 1
            from public.user_blocks block
            where (
              block.blocker_id = p_profile_id
              and block.blocked_id = p_recipient_id
            ) or (
              block.blocker_id = p_recipient_id
              and block.blocked_id = p_profile_id
            )
          )
          and (
            exists (
              select 1
              from public.friendships friendship
              where friendship.status in ('pending', 'accepted')
                and friendship.requester_id = p_profile_id
                and friendship.addressee_id = p_recipient_id
            )
            or exists (
              select 1
              from public.friendships friendship
              where friendship.status in ('pending', 'accepted')
                and friendship.requester_id = p_recipient_id
                and friendship.addressee_id = p_profile_id
            )
            or exists (
              select 1
              from public.dm_threads thread
              where thread.participant_1_id = p_profile_id
                and thread.participant_2_id = p_recipient_id
            )
            or exists (
              select 1
              from public.dm_threads thread
              where thread.participant_1_id = p_recipient_id
                and thread.participant_2_id = p_profile_id
            )
          )
        )
      )
  )
$function$;

revoke all on function public.expand_profile_updated_event(uuid, text)
  from public, anon, authenticated;
grant execute on function public.expand_profile_updated_event(uuid, text)
  to service_role;
revoke all on function public.can_deliver_profile_updated_hint(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.can_deliver_profile_updated_hint(uuid, uuid)
  to service_role;
