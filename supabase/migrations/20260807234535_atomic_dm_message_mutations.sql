-- DM edits/deletes are claimed, applied, and recorded in one transaction.
-- Storage deletion is intentionally handed to the durable outbox because it
-- cannot participate in the Postgres transaction.
do $$
begin
  if pg_catalog.to_regclass('public.idempotency_records') is null
     or pg_catalog.to_regclass('public.outbox_events') is null
     or pg_catalog.to_regclass('public.dm_messages') is null
     or pg_catalog.to_regclass('public.dm_threads') is null then
    raise exception 'durable DM workflows must be applied first';
  end if;
end;
$$;

create unique index if not exists outbox_events_dm_media_cleanup_uidx
  on public.outbox_events (event_type, aggregate_id)
  where event_type = 'dm.media_cleanup';

create table if not exists public.dm_media_cleanup_snapshots (
  cleanup_id uuid primary key,
  outbox_event_id uuid not null unique
    references public.outbox_events(id) on delete cascade,
  message_id uuid not null unique,
  thread_id uuid not null,
  actor_id uuid not null,
  sequence bigint not null check (sequence > 0),
  main_path text not null,
  main_object_id uuid,
  main_object_version text,
  main_object_digest text not null
    check (main_object_digest similar to '[0-9a-f]{64}'),
  thumbnail_path text,
  thumbnail_object_id uuid,
  thumbnail_object_version text,
  thumbnail_object_digest text,
  created_at timestamptz not null default now(),
  check (
    (
      thumbnail_path is null
      and thumbnail_object_id is null
      and thumbnail_object_version is null
      and thumbnail_object_digest is null
    )
    or (
      thumbnail_path is not null
      and thumbnail_object_digest similar to '[0-9a-f]{64}'
    )
  )
);

alter table public.dm_media_cleanup_snapshots enable row level security;
drop policy if exists "DM cleanup snapshots are server internal"
  on public.dm_media_cleanup_snapshots;
create policy "DM cleanup snapshots are server internal"
  on public.dm_media_cleanup_snapshots
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_media_cleanup_snapshots
  from public, anon, authenticated, service_role;

create or replace function app_private.dm_media_generation_digest(
  p_bucket_id text,
  p_path text,
  p_object_id uuid,
  p_object_version text,
  p_metadata jsonb,
  p_user_metadata jsonb
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        chr(31),
        p_bucket_id,
        p_path,
        coalesce(p_object_id::text, '<missing>'),
        coalesce(p_object_version, '<null>'),
        coalesce(p_metadata::text, '<null>'),
        coalesce(p_user_metadata::text, '<null>')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function app_private.dm_media_storage_object_digest(
  p_bucket_id text,
  p_path text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.dm_media_generation_digest(
    input.bucket_id,
    input.path,
    object.id,
    object.version,
    object.metadata,
    object.user_metadata
  )
  from (select p_bucket_id as bucket_id, p_path as path) input
  left join storage.objects object
    on object.bucket_id = input.bucket_id
   and object.name = input.path;
$$;

revoke all on function app_private.dm_media_generation_digest(
  text, text, uuid, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function app_private.dm_media_storage_object_digest(text, text)
  from public, anon, authenticated, service_role;

create or replace function app_private.is_canonical_dm_media_path(p_path text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_path similar to (
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)'
  ) or p_path similar to (
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_thumb[.](jpg|png|webp|gif)'
  );
$$;

revoke all on function app_private.is_canonical_dm_media_path(text)
  from public, anon, authenticated, service_role;

-- Chat media paths are server-generated and never reusable. This permanent
-- generation registry closes the authorization-to-Storage-delete race: after
-- a generation is registered, updates and later inserts at that exact path are
-- rejected, while DELETE and fresh unique-path INSERT operations remain valid.
create table if not exists public.dm_media_path_generations (
  bucket_id text not null check (bucket_id = 'media'),
  path text not null,
  object_id uuid,
  object_version text,
  object_digest text not null
    check (object_digest similar to '[0-9a-f]{64}'),
  registered_at timestamptz not null default now(),
  primary key (bucket_id, path),
  unique (object_id),
  check (object_id is not null or object_version is null)
);

alter table public.dm_media_path_generations enable row level security;
drop policy if exists "DM media path generations are server internal"
  on public.dm_media_path_generations;
create policy "DM media path generations are server internal"
  on public.dm_media_path_generations
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.dm_media_path_generations
  from public, anon, authenticated, service_role;

insert into public.dm_media_path_generations (
  bucket_id,
  path,
  object_id,
  object_version,
  object_digest
)
select
  object.bucket_id,
  object.name,
  object.id,
  object.version,
  app_private.dm_media_storage_object_digest(object.bucket_id, object.name)
from storage.objects object
where object.bucket_id = 'media'
  and app_private.is_canonical_dm_media_path(object.name)
on conflict (bucket_id, path) do nothing;

with referenced_path as (
  select
    message.sender_id,
    message.media_url as url,
    pg_catalog.split_part(
      message.media_url,
      '/storage/v1/object/public/media/',
      1
    ) as origin,
    pg_catalog.split_part(
      message.media_url,
      '/storage/v1/object/public/media/',
      2
    ) as path,
    false as thumbnail
  from public.dm_messages message
  where message.media_url is not null
  union all
  select
    message.sender_id,
    message.media_thumbnail_url,
    pg_catalog.split_part(
      message.media_thumbnail_url,
      '/storage/v1/object/public/media/',
      1
    ),
    pg_catalog.split_part(
      message.media_thumbnail_url,
      '/storage/v1/object/public/media/',
      2
    ),
    true
  from public.dm_messages message
  where message.media_thumbnail_url is not null
), canonical_path as (
  select referenced.path
  from referenced_path referenced
  where referenced.url = (
      referenced.origin || '/storage/v1/object/public/media/' || referenced.path
    )
    and (
      (
        not referenced.thumbnail
        and referenced.path similar to (
          referenced.sender_id::text
          || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp|gif)'
        )
      )
      or (
        referenced.thumbnail
        and referenced.path similar to (
          referenced.sender_id::text
          || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_thumb[.](jpg|png|webp|gif)'
        )
      )
    )
)
insert into public.dm_media_path_generations (
  bucket_id,
  path,
  object_id,
  object_version,
  object_digest
)
select
  'media',
  canonical.path,
  null,
  null,
  app_private.dm_media_storage_object_digest('media', canonical.path)
from canonical_path canonical
on conflict (bucket_id, path) do nothing;

create or replace function app_private.enforce_dm_media_path_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and new.bucket_id = 'media'
     and app_private.is_canonical_dm_media_path(new.name) then
    if exists (
      select 1
      from public.dm_media_path_generations generation
      where generation.bucket_id = new.bucket_id
        and generation.path = new.name
    ) then
      raise exception 'DM media path is immutable and cannot be reused';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    (
      old.bucket_id = 'media'
      and app_private.is_canonical_dm_media_path(old.name)
    )
    or (
      new.bucket_id = 'media'
      and app_private.is_canonical_dm_media_path(new.name)
    )
  ) and (
    new.id is distinct from old.id
    or new.bucket_id is distinct from old.bucket_id
    or new.name is distinct from old.name
    or new.owner is distinct from old.owner
    or new.owner_id is distinct from old.owner_id
    or new.created_at is distinct from old.created_at
    or new.version is distinct from old.version
    or new.metadata is distinct from old.metadata
    or new.user_metadata is distinct from old.user_metadata
  ) then
    raise exception 'DM media path is immutable and cannot be replaced';
  end if;

  return new;
end;
$$;

create or replace function app_private.register_dm_media_path_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bucket_id = 'media'
     and app_private.is_canonical_dm_media_path(new.name) then
    insert into public.dm_media_path_generations (
      bucket_id,
      path,
      object_id,
      object_version,
      object_digest
    )
    values (
      new.bucket_id,
      new.name,
      new.id,
      new.version,
      app_private.dm_media_generation_digest(
        new.bucket_id,
        new.name,
        new.id,
        new.version,
        new.metadata,
        new.user_metadata
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_dm_media_path_immutability()
  from public, anon, authenticated, service_role;
revoke all on function app_private.register_dm_media_path_generation()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_dm_media_path_immutability_before_write
  on storage.objects;
create trigger enforce_dm_media_path_immutability_before_write
before insert or update on storage.objects
for each row execute function app_private.enforce_dm_media_path_immutability();

drop trigger if exists register_dm_media_path_generation_after_insert
  on storage.objects;
create trigger register_dm_media_path_generation_after_insert
after insert on storage.objects
for each row execute function app_private.register_dm_media_path_generation();

create or replace function public.mutate_dm_message_idempotent(
  p_actor_id uuid,
  p_thread_id uuid,
  p_message_id uuid,
  p_action text,
  p_content text,
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
begin
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
$$;

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
    join public.outbox_events event
      on event.id = snapshot.outbox_event_id
    join public.dm_messages message on message.id = snapshot.message_id
    join public.dm_threads thread on thread.id = message.thread_id
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
      and main_generation.object_id is not distinct from snapshot.main_object_id
      and main_generation.object_version is not distinct from snapshot.main_object_version
      and main_generation.object_digest = snapshot.main_object_digest
      and (
        main_object.id is null
        or (
          main_object.id is not distinct from snapshot.main_object_id
          and main_object.version is not distinct from snapshot.main_object_version
          and app_private.dm_media_storage_object_digest(
            'media',
            snapshot.main_path
          ) = snapshot.main_object_digest
        )
      )
      and (
        snapshot.thumbnail_path is null
        or (
          thumbnail_generation.object_id is not distinct from snapshot.thumbnail_object_id
          and thumbnail_generation.object_version is not distinct from snapshot.thumbnail_object_version
          and thumbnail_generation.object_digest = snapshot.thumbnail_object_digest
          and (
            thumbnail_object.id is null
            or (
              thumbnail_object.id is not distinct from snapshot.thumbnail_object_id
              and thumbnail_object.version is not distinct from snapshot.thumbnail_object_version
              and app_private.dm_media_storage_object_digest(
                'media',
                snapshot.thumbnail_path
              ) = snapshot.thumbnail_object_digest
            )
          )
        )
      )
  );
$$;

revoke all on function public.mutate_dm_message_idempotent(
  uuid, uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.mutate_dm_message_idempotent(
  uuid, uuid, uuid, text, text, text, text, text, text
) to service_role;
revoke all on function public.authorize_dm_media_cleanup(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.authorize_dm_media_cleanup(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) to service_role;
