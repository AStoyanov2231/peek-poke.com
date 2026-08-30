-- Bind each immutable DM Storage generation to exactly one message. Claims are
-- permanent: deletion fences the claim but never releases a path for reuse.
do $$
begin
  if pg_catalog.to_regclass('public.dm_media_path_generations') is null
     or pg_catalog.to_regclass('public.dm_media_cleanup_snapshots') is null
     or pg_catalog.to_regclass('public.dm_messages') is null then
    raise exception 'atomic DM media generations must be applied first';
  end if;
end;
$$;

create or replace function app_private.dm_media_path_from_canonical_url(
  p_url text,
  p_actor_id uuid,
  p_thumbnail boolean
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  with parsed as (
    select
      pg_catalog.split_part(p_url, '/storage/v1/object/public/media/', 1) as origin,
      pg_catalog.split_part(p_url, '/storage/v1/object/public/media/', 2) as path
  )
  select case
    when p_url is not null
      and p_url = parsed.origin || '/storage/v1/object/public/media/' || parsed.path
      and (
        parsed.origin similar to 'http://[a-z0-9.-]+'
        or parsed.origin similar to 'https://[a-z0-9.-]+'
        or parsed.origin similar to 'http://[a-z0-9.-]+:[0-9]{1,5}'
        or parsed.origin similar to 'https://[a-z0-9.-]+:[0-9]{1,5}'
      )
      and (
        (
          not p_thumbnail
          and parsed.path similar to (
            p_actor_id::text
            || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)'
          )
        )
        or (
          p_thumbnail
          and parsed.path similar to (
            p_actor_id::text
            || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_thumb[.](jpg|png|webp|gif)'
          )
        )
      )
    then parsed.path
    else null
  end
  from parsed;
$$;

revoke all on function app_private.dm_media_path_from_canonical_url(
  text, uuid, boolean
) from public, anon, authenticated, service_role;

create table if not exists public.dm_media_claims (
  message_id uuid primary key
    references public.dm_messages(id) on delete restrict,
  thread_id uuid not null references public.dm_threads(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_id uuid not null,
  main_path text not null unique,
  thumbnail_path text unique,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  cleanup_fenced_at timestamptz,
  unique (thread_id, client_id),
  check (main_path is distinct from thumbnail_path),
  check (main_path similar to (
    actor_id::text
    || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)'
  )),
  check (
    thumbnail_path is null
    or thumbnail_path similar to (
      actor_id::text
      || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_thumb[.](jpg|png|webp|gif)'
    )
  ),
  check (
    thumbnail_path is null
    or pg_catalog.regexp_replace(
      main_path,
      '[.](jpg|png|webp|gif)$',
      ''
    ) = pg_catalog.regexp_replace(
      thumbnail_path,
      '_thumb[.](jpg|png|webp|gif)$',
      ''
    )
  )
);

alter table public.dm_media_claims enable row level security;
drop policy if exists "DM media claims are server internal"
  on public.dm_media_claims;
create policy "DM media claims are server internal"
  on public.dm_media_claims
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_media_claims
  from public, anon, authenticated, service_role;

create or replace function app_private.enforce_dm_media_claim_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.message_id is distinct from old.message_id
    or new.thread_id is distinct from old.thread_id
    or new.actor_id is distinct from old.actor_id
    or new.client_id is distinct from old.client_id
    or new.main_path is distinct from old.main_path
    or new.thumbnail_path is distinct from old.thumbnail_path
    or new.claimed_at is distinct from old.claimed_at
    or (
      old.cleanup_fenced_at is not null
      and new.cleanup_fenced_at is distinct from old.cleanup_fenced_at
    )
  ) then
    raise exception 'DM media claim binding is immutable';
  end if;

  if not exists (
    select 1
    from public.dm_messages message
    where message.id = new.message_id
      and message.thread_id = new.thread_id
      and message.sender_id = new.actor_id
      and message.client_id = new.client_id
      and message.is_deleted = false
      and app_private.dm_media_path_from_canonical_url(
        message.media_url,
        message.sender_id,
        false
      ) = new.main_path
      and (
        (
          message.media_thumbnail_url is null
          and new.thumbnail_path is null
        )
        or app_private.dm_media_path_from_canonical_url(
          message.media_thumbnail_url,
          message.sender_id,
          true
        ) = new.thumbnail_path
      )
  ) then
    raise exception 'DM media claim does not match its message';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_dm_media_claim_binding()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_dm_media_claim_binding_before_write
  on public.dm_media_claims;
create trigger enforce_dm_media_claim_binding_before_write
before insert or update on public.dm_media_claims
for each row execute function app_private.enforce_dm_media_claim_binding();

create table if not exists public.dm_media_claim_backfill_conflicts (
  message_id uuid primary key,
  thread_id uuid not null,
  actor_id uuid not null,
  client_id uuid,
  main_path text,
  thumbnail_path text,
  reason text not null check (reason in (
    'deleted_message_reference',
    'missing_main_path',
    'invalid_main_path',
    'invalid_thumbnail_path',
    'invalid_path_pair',
    'missing_client_id',
    'duplicate_path',
    'missing_or_changed_generation'
  )),
  related_message_ids uuid[] not null,
  evidence jsonb not null,
  detected_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.dm_media_claim_backfill_conflicts enable row level security;
drop policy if exists "DM media claim conflicts are server internal"
  on public.dm_media_claim_backfill_conflicts;
create policy "DM media claim conflicts are server internal"
  on public.dm_media_claim_backfill_conflicts
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_media_claim_backfill_conflicts
  from public, anon, authenticated, service_role;

alter table public.dm_media_path_generations
  add column if not exists claimed_message_id uuid,
  add column if not exists claim_role text,
  add column if not exists cleanup_fenced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.dm_media_path_generations'::pg_catalog.regclass
      and conname = 'dm_media_path_generations_claim_state_check'
  ) then
    alter table public.dm_media_path_generations
      add constraint dm_media_path_generations_claim_state_check
      check (
        (claimed_message_id is null and claim_role is null and cleanup_fenced_at is null)
        or (
          claimed_message_id is not null
          and claim_role in ('main', 'thumbnail')
        )
      );
  end if;
end;
$$;

create unique index if not exists dm_media_path_generations_claim_role_uidx
  on public.dm_media_path_generations (claimed_message_id, claim_role)
  where claimed_message_id is not null;

-- Capture every pre-existing media reference before claiming any generation.
-- Conflicted rows intentionally remain unclaimed, so their delete path fails
-- closed and operators retain durable remediation evidence.
create temporary table dm_media_claim_backfill_candidates as
select
  message.id as message_id,
  message.thread_id,
  message.sender_id as actor_id,
  message.client_id,
  message.is_deleted,
  message.media_url,
  message.media_thumbnail_url,
  app_private.dm_media_path_from_canonical_url(
    message.media_url,
    message.sender_id,
    false
  ) as main_path,
  app_private.dm_media_path_from_canonical_url(
    message.media_thumbnail_url,
    message.sender_id,
    true
  ) as thumbnail_path
from public.dm_messages message
where message.media_url is not null
   or message.media_thumbnail_url is not null;

with path_reference as (
  select candidate.message_id, candidate.main_path as path
  from dm_media_claim_backfill_candidates candidate
  where candidate.main_path is not null
  union all
  select candidate.message_id, candidate.thumbnail_path
  from dm_media_claim_backfill_candidates candidate
  where candidate.thumbnail_path is not null
), duplicate_path as (
  select
    reference.path,
    pg_catalog.array_agg(distinct reference.message_id order by reference.message_id) as message_ids
  from path_reference reference
  group by reference.path
  having pg_catalog.count(distinct reference.message_id) > 1
), classified as (
  select
    candidate.*,
    case
      when candidate.is_deleted then 'deleted_message_reference'
      when candidate.media_url is null then 'missing_main_path'
      when candidate.main_path is null then 'invalid_main_path'
      when candidate.media_thumbnail_url is not null
        and candidate.thumbnail_path is null then 'invalid_thumbnail_path'
      when candidate.thumbnail_path is not null and (
        pg_catalog.split_part(candidate.media_url, '/storage/v1/object/public/media/', 1)
          is distinct from
        pg_catalog.split_part(candidate.media_thumbnail_url, '/storage/v1/object/public/media/', 1)
        or pg_catalog.regexp_replace(
          candidate.main_path,
          '[.](jpg|png|webp|gif)$',
          ''
        ) is distinct from pg_catalog.regexp_replace(
          candidate.thumbnail_path,
          '_thumb[.](jpg|png|webp|gif)$',
          ''
        )
      ) then 'invalid_path_pair'
      when candidate.client_id is null then 'missing_client_id'
      when main_duplicate.path is not null
        or thumbnail_duplicate.path is not null then 'duplicate_path'
      when main_generation.path is null
        or main_object.id is null
        or (
          candidate.thumbnail_path is not null
          and (thumbnail_generation.path is null or thumbnail_object.id is null)
        ) then 'missing_or_changed_generation'
      else null
    end as reason,
    coalesce(
      main_duplicate.message_ids,
      thumbnail_duplicate.message_ids,
      array[candidate.message_id]
    ) as related_message_ids
  from dm_media_claim_backfill_candidates candidate
  left join duplicate_path main_duplicate on main_duplicate.path = candidate.main_path
  left join duplicate_path thumbnail_duplicate on thumbnail_duplicate.path = candidate.thumbnail_path
  left join public.dm_media_path_generations main_generation
    on main_generation.bucket_id = 'media'
   and main_generation.path = candidate.main_path
  left join storage.objects main_object
    on main_object.bucket_id = 'media'
   and main_object.name = candidate.main_path
   and main_object.id is not distinct from main_generation.object_id
   and main_object.version is not distinct from main_generation.object_version
   and app_private.dm_media_storage_object_digest(
     'media', candidate.main_path
   ) = main_generation.object_digest
  left join public.dm_media_path_generations thumbnail_generation
    on thumbnail_generation.bucket_id = 'media'
   and thumbnail_generation.path = candidate.thumbnail_path
  left join storage.objects thumbnail_object
    on thumbnail_object.bucket_id = 'media'
   and thumbnail_object.name = candidate.thumbnail_path
   and thumbnail_object.id is not distinct from thumbnail_generation.object_id
   and thumbnail_object.version is not distinct from thumbnail_generation.object_version
   and app_private.dm_media_storage_object_digest(
     'media', candidate.thumbnail_path
   ) = thumbnail_generation.object_digest
)
insert into public.dm_media_claim_backfill_conflicts (
  message_id,
  thread_id,
  actor_id,
  client_id,
  main_path,
  thumbnail_path,
  reason,
  related_message_ids,
  evidence
)
select
  classified.message_id,
  classified.thread_id,
  classified.actor_id,
  classified.client_id,
  classified.main_path,
  classified.thumbnail_path,
  classified.reason,
  classified.related_message_ids,
  pg_catalog.jsonb_build_object(
    'media_url', classified.media_url,
    'media_thumbnail_url', classified.media_thumbnail_url,
    'related_message_ids', classified.related_message_ids
  )
from classified
where classified.reason is not null
on conflict (message_id) do nothing;

insert into public.dm_media_claims (
  message_id,
  thread_id,
  actor_id,
  client_id,
  main_path,
  thumbnail_path
)
select
  candidate.message_id,
  candidate.thread_id,
  candidate.actor_id,
  candidate.client_id,
  candidate.main_path,
  candidate.thumbnail_path
from dm_media_claim_backfill_candidates candidate
where not exists (
  select 1
  from public.dm_media_claim_backfill_conflicts conflict
  where conflict.message_id = candidate.message_id
)
on conflict do nothing;

update public.dm_media_path_generations generation
set claimed_message_id = claim.message_id,
    claim_role = 'main'
from public.dm_media_claims claim
where generation.bucket_id = 'media'
  and generation.path = claim.main_path
  and generation.claimed_message_id is null;

update public.dm_media_path_generations generation
set claimed_message_id = claim.message_id,
    claim_role = 'thumbnail'
from public.dm_media_claims claim
where generation.bucket_id = 'media'
  and generation.path = claim.thumbnail_path
  and generation.claimed_message_id is null;

do $$
begin
  if exists (
    select 1
    from public.dm_media_claims claim
    left join public.dm_media_path_generations main_generation
      on main_generation.bucket_id = 'media'
     and main_generation.path = claim.main_path
     and main_generation.claimed_message_id = claim.message_id
     and main_generation.claim_role = 'main'
    left join public.dm_media_path_generations thumbnail_generation
      on thumbnail_generation.bucket_id = 'media'
     and thumbnail_generation.path = claim.thumbnail_path
     and thumbnail_generation.claimed_message_id = claim.message_id
     and thumbnail_generation.claim_role = 'thumbnail'
    where main_generation.path is null
       or (claim.thumbnail_path is not null and thumbnail_generation.path is null)
  ) then
    raise exception 'DM media claim backfill produced an incomplete pair';
  end if;
end;
$$;

drop table dm_media_claim_backfill_candidates;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.dm_media_path_generations'::pg_catalog.regclass
      and conname = 'dm_media_path_generations_claim_message_fkey'
  ) then
    alter table public.dm_media_path_generations
      add constraint dm_media_path_generations_claim_message_fkey
      foreign key (claimed_message_id)
      references public.dm_media_claims(message_id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.send_message_transactional(
  p_thread_id uuid,
  p_sender_id uuid,
  p_client_id uuid,
  p_content text,
  p_message_type text default 'text',
  p_media_url text default null,
  p_media_thumbnail_url text default null,
  p_reply_to_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
begin
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
    set last_read_sequence = pg_catalog.greatest(member.last_read_sequence, v_sequence),
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
$$;

revoke all on function public.send_message_transactional(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.send_message_transactional(
  uuid, uuid, uuid, text, text, text, text, uuid
) to service_role;

create or replace function app_private.fence_dm_media_claim_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main_path text;
  v_thumbnail_path text;
  v_fenced_at timestamptz;
  v_row_count integer;
begin
  if old.is_deleted
     or not new.is_deleted
     or old.media_url is null then
    return new;
  end if;

  v_main_path := app_private.dm_media_path_from_canonical_url(
    old.media_url,
    old.sender_id,
    false
  );
  v_thumbnail_path := case when old.media_thumbnail_url is null then null else
    app_private.dm_media_path_from_canonical_url(
      old.media_thumbnail_url,
      old.sender_id,
      true
    )
  end;

  if v_main_path is null
     or (old.media_thumbnail_url is not null and v_thumbnail_path is null) then
    raise exception 'DM media claim is unavailable';
  end if;

  perform claim.message_id
  from public.dm_media_claims claim
  where claim.message_id = old.id
    and claim.thread_id = old.thread_id
    and claim.actor_id = old.sender_id
    and claim.client_id is not distinct from old.client_id
    and claim.main_path = v_main_path
    and claim.thumbnail_path is not distinct from v_thumbnail_path
    and claim.cleanup_fenced_at is null
  for update;
  if not found then
    raise exception 'DM media claim is unavailable';
  end if;

  if exists (
    select 1
    from public.dm_media_claim_backfill_conflicts conflict
    where conflict.message_id = old.id
  ) or not exists (
    select 1
    from public.dm_media_path_generations generation
    where generation.bucket_id = 'media'
      and generation.path = v_main_path
      and generation.claimed_message_id = old.id
      and generation.claim_role = 'main'
      and generation.cleanup_fenced_at is null
  ) or (
    v_thumbnail_path is not null
    and not exists (
      select 1
      from public.dm_media_path_generations generation
      where generation.bucket_id = 'media'
        and generation.path = v_thumbnail_path
        and generation.claimed_message_id = old.id
        and generation.claim_role = 'thumbnail'
        and generation.cleanup_fenced_at is null
    )
  ) then
    raise exception 'DM media claim is unavailable';
  end if;

  v_fenced_at := pg_catalog.clock_timestamp();
  update public.dm_media_claims claim
  set cleanup_fenced_at = v_fenced_at
  where claim.message_id = old.id
    and claim.cleanup_fenced_at is null;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'DM media claim fence was lost';
  end if;

  update public.dm_media_path_generations generation
  set cleanup_fenced_at = v_fenced_at
  where generation.bucket_id = 'media'
    and generation.claimed_message_id = old.id
    and generation.path in (v_main_path, v_thumbnail_path);
  get diagnostics v_row_count = row_count;
  if v_row_count <> (case when v_thumbnail_path is null then 1 else 2 end) then
    raise exception 'DM media generation fence was incomplete';
  end if;

  return new;
end;
$$;

revoke all on function app_private.fence_dm_media_claim_before_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists fence_dm_media_claim_before_delete
  on public.dm_messages;
create trigger fence_dm_media_claim_before_delete
before update on public.dm_messages
for each row execute function app_private.fence_dm_media_claim_before_delete();

create or replace function public.authorize_dm_media_cleanup(
  p_event_id uuid,
  p_cleanup_id uuid,
  p_message_id uuid,
  p_thread_id uuid,
  p_actor_id uuid,
  p_sequence bigint,
  p_main_path text,
  p_main_object_digest text,
  p_thumbnail_path text,
  p_thumbnail_object_digest text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dm_media_cleanup_snapshots snapshot
    join public.outbox_events event on event.id = snapshot.outbox_event_id
    join public.dm_messages message on message.id = snapshot.message_id
    join public.dm_threads thread on thread.id = message.thread_id
    join public.dm_media_claims claim on claim.message_id = snapshot.message_id
    join public.dm_media_path_generations main_generation
      on main_generation.bucket_id = 'media'
     and main_generation.path = snapshot.main_path
    left join public.dm_media_path_generations thumbnail_generation
      on thumbnail_generation.bucket_id = 'media'
     and thumbnail_generation.path = snapshot.thumbnail_path
    left join storage.objects main_object
      on main_object.bucket_id = 'media'
     and main_object.name = snapshot.main_path
    left join storage.objects thumbnail_object
      on thumbnail_object.bucket_id = 'media'
     and thumbnail_object.name = snapshot.thumbnail_path
    where snapshot.cleanup_id = p_cleanup_id
      and snapshot.outbox_event_id = p_event_id
      and snapshot.message_id = p_message_id
      and snapshot.thread_id = p_thread_id
      and snapshot.actor_id = p_actor_id
      and snapshot.sequence = p_sequence
      and snapshot.main_path = p_main_path
      and snapshot.main_object_digest = p_main_object_digest
      and snapshot.thumbnail_path is not distinct from p_thumbnail_path
      and snapshot.thumbnail_object_digest is not distinct from p_thumbnail_object_digest
      and event.event_type = 'dm.media_cleanup'
      and event.aggregate_type = 'dm_message'
      and event.aggregate_id = p_message_id::text
      and event.status = 'processing'
      and event.payload = pg_catalog.jsonb_build_object(
        'cleanup_id', snapshot.cleanup_id,
        'message_id', snapshot.message_id,
        'thread_id', snapshot.thread_id,
        'actor_id', snapshot.actor_id,
        'sequence', snapshot.sequence,
        'main_path', snapshot.main_path,
        'main_object_digest', snapshot.main_object_digest,
        'thumbnail_path', snapshot.thumbnail_path,
        'thumbnail_object_digest', snapshot.thumbnail_object_digest
      )
      and message.thread_id = snapshot.thread_id
      and message.sender_id = snapshot.actor_id
      and message.sequence = snapshot.sequence
      and message.is_deleted = true
      and snapshot.actor_id in (thread.participant_1_id, thread.participant_2_id)
      and claim.thread_id = snapshot.thread_id
      and claim.actor_id = snapshot.actor_id
      and claim.client_id = message.client_id
      and claim.main_path = snapshot.main_path
      and claim.thumbnail_path is not distinct from snapshot.thumbnail_path
      and claim.cleanup_fenced_at is not null
      and main_generation.claimed_message_id = snapshot.message_id
      and main_generation.claim_role = 'main'
      and main_generation.cleanup_fenced_at is not null
      and main_generation.object_id is not distinct from snapshot.main_object_id
      and main_generation.object_version is not distinct from snapshot.main_object_version
      and main_generation.object_digest = snapshot.main_object_digest
      and (
        main_object.id is null
        or (
          main_object.id is not distinct from snapshot.main_object_id
          and main_object.version is not distinct from snapshot.main_object_version
          and app_private.dm_media_storage_object_digest(
            'media', snapshot.main_path
          ) = snapshot.main_object_digest
        )
      )
      and (
        snapshot.thumbnail_path is null
        or (
          thumbnail_generation.claimed_message_id = snapshot.message_id
          and thumbnail_generation.claim_role = 'thumbnail'
          and thumbnail_generation.cleanup_fenced_at is not null
          and thumbnail_generation.object_id is not distinct from snapshot.thumbnail_object_id
          and thumbnail_generation.object_version is not distinct from snapshot.thumbnail_object_version
          and thumbnail_generation.object_digest = snapshot.thumbnail_object_digest
          and (
            thumbnail_object.id is null
            or (
              thumbnail_object.id is not distinct from snapshot.thumbnail_object_id
              and thumbnail_object.version is not distinct from snapshot.thumbnail_object_version
              and app_private.dm_media_storage_object_digest(
                'media', snapshot.thumbnail_path
              ) = snapshot.thumbnail_object_digest
            )
          )
        )
      )
      and not exists (
        select 1
        from public.dm_media_claims competitor
        join public.dm_messages competing_message
          on competing_message.id = competitor.message_id
        where competitor.message_id <> snapshot.message_id
          and competing_message.is_deleted = false
          and (
            competitor.main_path in (snapshot.main_path, snapshot.thumbnail_path)
            or competitor.thumbnail_path in (snapshot.main_path, snapshot.thumbnail_path)
          )
      )
      and not exists (
        select 1
        from public.dm_media_claim_backfill_conflicts conflict
        where conflict.message_id = snapshot.message_id
           or snapshot.message_id = any(conflict.related_message_ids)
      )
  );
$$;

revoke all on function public.authorize_dm_media_cleanup(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.authorize_dm_media_cleanup(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) to service_role;
