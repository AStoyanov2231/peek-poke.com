-- Account erasure may tombstone legacy DM media that intentionally has no
-- exclusive claim. An immutable disposition row is the only alternate path
-- through the normal delete trigger; no session flag or caller-controlled GUC
-- can bypass claim enforcement.
do $$
begin
  if pg_catalog.to_regclass('public.dm_media_claims') is null
     or pg_catalog.to_regclass('public.dm_media_claim_backfill_conflicts') is null
     or pg_catalog.to_regclass('public.account_deletion_jobs') is null
     or pg_catalog.to_regclass('public.outbox_events') is null then
    raise exception 'exclusive DM media claims and durable deletion must be applied first';
  end if;
end;
$$;

create or replace function app_private.dm_media_preservation_path(
  p_url text,
  p_actor_id uuid
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  with extracted as (
    select case
      when pg_catalog.strpos(p_url, '/storage/v1/object/public/media/') > 0 then
        pg_catalog.split_part(
          pg_catalog.split_part(p_url, '/storage/v1/object/public/media/', 2),
          '?',
          1
        )
      when pg_catalog.strpos(p_url, '/storage/v1/object/sign/media/') > 0 then
        pg_catalog.split_part(
          pg_catalog.split_part(p_url, '/storage/v1/object/sign/media/', 2),
          '?',
          1
        )
      else null
    end as path
  )
  select case
    when extracted.path like p_actor_id::text || '/%'
      and extracted.path not like '%..%'
      and pg_catalog.strpos(extracted.path, pg_catalog.chr(92)) = 0
      and pg_catalog.char_length(extracted.path) between 38 and 1024
    then extracted.path
    else null
  end
  from extracted;
$$;

revoke all on function app_private.dm_media_preservation_path(text, uuid)
  from public, anon, authenticated, service_role;

create table if not exists public.dm_media_account_erasure_dispositions (
  message_id uuid primary key
    references public.dm_messages(id) on delete restrict,
  thread_id uuid not null,
  actor_id uuid not null,
  client_id uuid,
  original_media_url text,
  original_thumbnail_url text,
  main_path text,
  thumbnail_path text,
  disposition text not null check (disposition in (
    'claimed_account_cleanup',
    'preserve_unclaimed'
  )),
  preserve_owner_media_prefix boolean not null default false,
  evidence jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (original_media_url is not null or original_thumbnail_url is not null),
  check (
    disposition = 'preserve_unclaimed'
    or not preserve_owner_media_prefix
  )
);

alter table public.dm_media_account_erasure_dispositions enable row level security;
drop policy if exists "DM media erasure dispositions are server internal"
  on public.dm_media_account_erasure_dispositions;
create policy "DM media erasure dispositions are server internal"
  on public.dm_media_account_erasure_dispositions
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_media_account_erasure_dispositions
  from public, anon, authenticated, service_role;

create or replace function app_private.keep_dm_media_erasure_disposition_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'DM media account-erasure disposition is immutable';
end;
$$;

revoke all on function app_private.keep_dm_media_erasure_disposition_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists keep_dm_media_erasure_disposition_immutable
  on public.dm_media_account_erasure_dispositions;
create trigger keep_dm_media_erasure_disposition_immutable
before update or delete on public.dm_media_account_erasure_dispositions
for each row execute function app_private.keep_dm_media_erasure_disposition_immutable();

create or replace function app_private.prepare_dm_media_account_erasure(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  perform message.id
  from public.dm_messages message
  where message.sender_id = p_user_id
  order by message.id
  for update;

  with candidate as (
    select
      message.id as message_id,
      message.thread_id,
      message.sender_id as actor_id,
      message.client_id,
      message.media_url,
      message.media_thumbnail_url,
      app_private.dm_media_path_from_canonical_url(
        message.media_url,
        message.sender_id,
        false
      ) as canonical_main_path,
      app_private.dm_media_path_from_canonical_url(
        message.media_thumbnail_url,
        message.sender_id,
        true
      ) as canonical_thumbnail_path,
      app_private.dm_media_preservation_path(
        message.media_url,
        message.sender_id
      ) as preservation_main_path,
      app_private.dm_media_preservation_path(
        message.media_thumbnail_url,
        message.sender_id
      ) as preservation_thumbnail_path
    from public.dm_messages message
    where message.sender_id = p_user_id
      and (message.media_url is not null or message.media_thumbnail_url is not null)
  ), classified as (
    select
      candidate.*,
      claim.message_id is not null
        and conflict.message_id is null
        and claim.cleanup_fenced_at is null
        and main_generation.path is not null
        and main_generation.cleanup_fenced_at is null
        and (
          candidate.media_thumbnail_url is null
          or (
            thumbnail_generation.path is not null
            and thumbnail_generation.cleanup_fenced_at is null
          )
        ) as has_exclusive_claim,
      conflict.reason as conflict_reason
    from candidate
    left join public.dm_media_claims claim
      on claim.message_id = candidate.message_id
     and claim.thread_id = candidate.thread_id
     and claim.actor_id = candidate.actor_id
     and claim.client_id is not distinct from candidate.client_id
     and claim.main_path = candidate.canonical_main_path
     and claim.thumbnail_path is not distinct from candidate.canonical_thumbnail_path
    left join public.dm_media_claim_backfill_conflicts conflict
      on conflict.message_id = candidate.message_id
    left join public.dm_media_path_generations main_generation
      on main_generation.bucket_id = 'media'
     and main_generation.path = candidate.canonical_main_path
     and main_generation.claimed_message_id = candidate.message_id
     and main_generation.claim_role = 'main'
    left join public.dm_media_path_generations thumbnail_generation
      on thumbnail_generation.bucket_id = 'media'
     and thumbnail_generation.path = candidate.canonical_thumbnail_path
     and thumbnail_generation.claimed_message_id = candidate.message_id
     and thumbnail_generation.claim_role = 'thumbnail'
  )
  insert into public.dm_media_account_erasure_dispositions (
    message_id,
    thread_id,
    actor_id,
    client_id,
    original_media_url,
    original_thumbnail_url,
    main_path,
    thumbnail_path,
    disposition,
    preserve_owner_media_prefix,
    evidence
  )
  select
    classified.message_id,
    classified.thread_id,
    classified.actor_id,
    classified.client_id,
    classified.media_url,
    classified.media_thumbnail_url,
    coalesce(classified.canonical_main_path, classified.preservation_main_path),
    coalesce(classified.canonical_thumbnail_path, classified.preservation_thumbnail_path),
    case when classified.has_exclusive_claim
      then 'claimed_account_cleanup'
      else 'preserve_unclaimed'
    end,
    not classified.has_exclusive_claim and (
      (classified.media_url is not null and classified.preservation_main_path is null)
      or (
        classified.media_thumbnail_url is not null
        and classified.preservation_thumbnail_path is null
      )
    ),
    pg_catalog.jsonb_build_object(
      'claim_message_id', case when classified.has_exclusive_claim
        then classified.message_id else null end,
      'backfill_conflict_reason', classified.conflict_reason,
      'canonical_main_path', classified.canonical_main_path,
      'canonical_thumbnail_path', classified.canonical_thumbnail_path,
      'preservation_main_path', classified.preservation_main_path,
      'preservation_thumbnail_path', classified.preservation_thumbnail_path
    )
  from classified
  on conflict (message_id) do nothing;
  get diagnostics v_inserted = row_count;

  if exists (
    select 1
    from public.dm_messages message
    join public.dm_media_account_erasure_dispositions disposition
      on disposition.message_id = message.id
    where message.sender_id = p_user_id
      and (message.media_url is not null or message.media_thumbnail_url is not null)
      and (
        disposition.thread_id is distinct from message.thread_id
        or disposition.actor_id is distinct from message.sender_id
        or disposition.client_id is distinct from message.client_id
        or disposition.original_media_url is distinct from message.media_url
        or disposition.original_thumbnail_url is distinct from message.media_thumbnail_url
      )
  ) then
    raise exception 'DM media account-erasure disposition does not match its message';
  end if;

  return v_inserted;
end;
$$;

revoke all on function app_private.prepare_dm_media_account_erasure(uuid)
  from public, anon, authenticated, service_role;

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
  v_erasure_disposition text;
begin
  if old.is_deleted
     or not new.is_deleted
     or (old.media_url is null and old.media_thumbnail_url is null) then
    return new;
  end if;

  select disposition.disposition
  into v_erasure_disposition
  from public.dm_media_account_erasure_dispositions disposition
  where disposition.message_id = old.id
    and disposition.thread_id = old.thread_id
    and disposition.actor_id = old.sender_id
    and disposition.client_id is not distinct from old.client_id
    and disposition.original_media_url is not distinct from old.media_url
    and disposition.original_thumbnail_url is not distinct from old.media_thumbnail_url;

  if found and v_erasure_disposition = 'preserve_unclaimed' then
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

create or replace function public.erase_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_at timestamptz;
  v_thread_ids uuid[];
  v_erased_messages integer := 0;
  v_dispositions integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select profile.deleted_at
  into v_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('error', 'PROFILE_NOT_FOUND');
  end if;

  if v_deleted_at is not null then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'already_erased', true,
      'erased_messages', 0,
      'media_dispositions', (
        select pg_catalog.count(*)
        from public.dm_media_account_erasure_dispositions disposition
        where disposition.actor_id = p_user_id
      )
    );
  end if;

  select pg_catalog.array_agg(distinct message.thread_id)
  into v_thread_ids
  from public.dm_messages message
  where message.sender_id = p_user_id;

  v_dispositions := app_private.prepare_dm_media_account_erasure(p_user_id);

  update public.dm_messages message
  set content = null,
      media_url = null,
      media_thumbnail_url = null,
      message_type = 'system',
      is_read = true,
      is_edited = false,
      is_deleted = true,
      read_at = pg_catalog.coalesce(message.read_at, pg_catalog.now()),
      reply_to_id = null
  where message.sender_id = p_user_id;
  get diagnostics v_erased_messages = row_count;

  update public.dm_threads thread
  set last_message_at = (
        select message.created_at
        from public.dm_messages message
        where message.thread_id = thread.id
          and message.is_deleted = false
        order by message.created_at desc
        limit 1
      ),
      last_message_preview = (
        select case
          when message.message_type = 'image' then 'Photo'
          else pg_catalog.left(pg_catalog.coalesce(message.content, ''), 100)
        end
        from public.dm_messages message
        where message.thread_id = thread.id
          and message.is_deleted = false
        order by message.created_at desc
        limit 1
      )
  where v_thread_ids is not null
    and thread.id = any(v_thread_ids);

  delete from public.user_locations location where location.user_id = p_user_id;
  delete from public.profile_photos photo where photo.user_id = p_user_id;
  delete from public.profile_interests interest where interest.user_id = p_user_id;
  delete from public.friendships friendship
  where friendship.requester_id = p_user_id or friendship.addressee_id = p_user_id;
  delete from public.subscriptions subscription where subscription.user_id = p_user_id;
  delete from public.billing_entitlement_state state where state.user_id = p_user_id;
  delete from public.user_roles role where role.user_id = p_user_id;
  delete from public.admin_coin_collections collection where collection.user_id = p_user_id;
  delete from public.coin_bots bot where bot.user_id = p_user_id;
  delete from public.coin_transactions transaction where transaction.user_id = p_user_id;
  update public.coin_transactions transaction
  set related_user_id = null
  where transaction.related_user_id = p_user_id;
  delete from public.friend_meetings meeting
  where meeting.user_a_id = p_user_id or meeting.user_b_id = p_user_id;
  delete from public.user_blocks block
  where block.blocker_id = p_user_id or block.blocked_id = p_user_id;
  delete from public.user_coins coin where coin.user_id = p_user_id;
  update public.admin_coins coin set created_by = null where coin.created_by = p_user_id;
  update public.profile_photos photo set reviewed_by = null where photo.reviewed_by = p_user_id;
  update public.user_reports report set reviewed_by = null where report.reviewed_by = p_user_id;
  delete from public.private_storage_migration_backups backup
  where backup.original_row ->> 'user_id' = p_user_id::text
     or backup.original_row ->> 'sender_id' = p_user_id::text;

  update public.profiles profile
  set username = 'deleted_' || pg_catalog.left(
        pg_catalog.replace(gen_random_uuid()::text, '-', ''),
        12
      ),
      display_name = 'Deleted member',
      bio = null,
      avatar_url = null,
      cover_image_url = null,
      location_text = null,
      is_online = false,
      last_seen_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      stripe_customer_id = null,
      onboarding_completed = false,
      push_tokens = '[]'::jsonb,
      deleted_at = pg_catalog.now()
  where profile.id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'already_erased', false,
    'erased_messages', v_erased_messages,
    'media_dispositions', v_dispositions
  );
end;
$$;

revoke all on function public.erase_account_data(uuid)
  from public, anon, authenticated;
grant execute on function public.erase_account_data(uuid)
  to service_role;

create unique index if not exists outbox_events_account_cleanup_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'account.cleanup';

create or replace function public.queue_account_deletion(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_storage_objects jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erasure jsonb;
  v_job_id uuid;
  v_filtered_storage_objects jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  if p_storage_objects is null
     or pg_catalog.jsonb_typeof(p_storage_objects) <> 'array' then
    return pg_catalog.jsonb_build_object('error', 'INVALID_STORAGE_OBJECTS');
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_storage_objects) entry
    where pg_catalog.jsonb_typeof(entry) <> 'object'
       or pg_catalog.jsonb_typeof(entry -> 'bucket') <> 'string'
       or pg_catalog.jsonb_typeof(entry -> 'path') <> 'string'
       or pg_catalog.nullif(entry ->> 'bucket', '') is null
       or pg_catalog.nullif(entry ->> 'path', '') is null
       or entry - array['bucket', 'path'] <> '{}'::jsonb
  ) then
    return pg_catalog.jsonb_build_object('error', 'INVALID_STORAGE_OBJECTS');
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_storage_objects) entry
    where not (
      (
        entry ->> 'bucket' in (
          'profile-photos',
          'private-profile-photos',
          'covers',
          'media'
        )
        and entry ->> 'path' like p_user_id::text || '/%'
      )
      or exists (
        select 1
        from storage.objects object
        where object.bucket_id = entry ->> 'bucket'
          and object.name = entry ->> 'path'
          and (
            object.owner = p_user_id
            or object.owner_id = p_user_id::text
          )
      )
      or exists (
        select 1
        from public.private_storage_migration_backups backup
        cross join lateral pg_catalog.jsonb_array_elements(
          backup.backup_objects
        ) backup_object
        where (
          backup.original_row ->> 'user_id' = p_user_id::text
          or backup.original_row ->> 'sender_id' = p_user_id::text
        )
          and backup_object ->> 'backup_bucket' = entry ->> 'bucket'
          and backup_object ->> 'backup_path' = entry ->> 'path'
      )
    )
  ) then
    return pg_catalog.jsonb_build_object('error', 'STORAGE_OBJECT_OWNERSHIP_MISMATCH');
  end if;

  v_erasure := public.erase_account_data(p_user_id);
  if pg_catalog.coalesce((v_erasure ->> 'success')::boolean, false) is false then
    return v_erasure;
  end if;

  with unique_object as (
    select distinct entry ->> 'bucket' as bucket, entry ->> 'path' as path
    from pg_catalog.jsonb_array_elements(p_storage_objects) entry
  ), removable as (
    select object.bucket, object.path
    from unique_object object
    where not (
      object.bucket = 'media'
      and exists (
        select 1
        from public.dm_media_account_erasure_dispositions disposition
        where disposition.actor_id = p_user_id
          and disposition.disposition = 'preserve_unclaimed'
          and (
            (
              disposition.preserve_owner_media_prefix
              and object.path like p_user_id::text || '/%'
            )
            or object.path = disposition.main_path
            or object.path = disposition.thumbnail_path
          )
      )
    )
  )
  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('bucket', removable.bucket, 'path', removable.path)
      order by removable.bucket, removable.path
    ),
    '[]'::jsonb
  )
  into v_filtered_storage_objects
  from removable;

  insert into public.account_deletion_jobs (
    user_id,
    stripe_customer_id,
    storage_objects
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    v_filtered_storage_objects
  )
  on conflict (user_id) do update
  set stripe_customer_id = pg_catalog.coalesce(
        public.account_deletion_jobs.stripe_customer_id,
        excluded.stripe_customer_id
      ),
      storage_objects = case
        when public.account_deletion_jobs.storage_objects = '[]'::jsonb
          then excluded.storage_objects
        else public.account_deletion_jobs.storage_objects
      end,
      status = case
        when public.account_deletion_jobs.status = 'dead' then 'pending'
        else public.account_deletion_jobs.status
      end,
      attempts = case
        when public.account_deletion_jobs.status = 'dead' then 0
        else public.account_deletion_jobs.attempts
      end,
      last_error = case
        when public.account_deletion_jobs.status = 'dead' then null
        else public.account_deletion_jobs.last_error
      end,
      completed_at = case
        when public.account_deletion_jobs.status = 'dead' then null
        else public.account_deletion_jobs.completed_at
      end
  returning id into v_job_id;

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'account.cleanup',
    'account_deletion',
    v_job_id::text,
    pg_catalog.jsonb_build_object('job_id', v_job_id, 'user_id', p_user_id)
  )
  on conflict (event_type, aggregate_id)
    where event_type = 'account.cleanup'
  do update
  set payload = excluded.payload,
      status = case when public.outbox_events.status = 'dead'
        then 'pending' else public.outbox_events.status end,
      attempts = case when public.outbox_events.status = 'dead'
        then 0 else public.outbox_events.attempts end,
      available_at = case when public.outbox_events.status = 'dead'
        then pg_catalog.now() else public.outbox_events.available_at end,
      locked_at = case when public.outbox_events.status = 'dead'
        then null else public.outbox_events.locked_at end,
      locked_by = case when public.outbox_events.status = 'dead'
        then null else public.outbox_events.locked_by end,
      last_error = case when public.outbox_events.status = 'dead'
        then null else public.outbox_events.last_error end,
      completed_at = case when public.outbox_events.status = 'dead'
        then null else public.outbox_events.completed_at end;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'queued', true,
    'job_id', v_job_id,
    'media_preserved', (
      select pg_catalog.count(*)
      from public.dm_media_account_erasure_dispositions disposition
      where disposition.actor_id = p_user_id
        and disposition.disposition = 'preserve_unclaimed'
    )
  );
end;
$$;

revoke all on function public.queue_account_deletion(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.queue_account_deletion(uuid, text, jsonb)
  to service_role;
