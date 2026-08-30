-- Produce the exact bounded Storage snapshot used by durable account erasure.
-- The public RPC is service-only; the two-argument queue wrapper consumes the
-- same snapshot inside one database transaction so uploads cannot race a
-- separate list and queue request.
do $$
begin
  if pg_catalog.to_regclass('public.account_deletion_jobs') is null
     or pg_catalog.to_regclass('public.dm_media_account_erasure_dispositions') is null
     or pg_catalog.to_regclass('public.private_storage_migration_backups') is null
     or pg_catalog.to_regclass('public.profile_photos') is null
     or pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regprocedure(
       'public.queue_account_deletion(uuid,text,jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'app_private.prepare_dm_media_account_erasure(uuid)'
     ) is null then
    raise exception 'account-erasure-safe DM media and durable deletion must be applied first';
  end if;
end;
$$;

create or replace function app_private.account_erasure_storage_path_is_canonical(
  p_path text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_path is not null
    and pg_catalog.char_length(p_path) between 1 and 1024
    and p_path !~ '(^|/)[.]{1,2}(/|$)'
    and p_path ~ '^[0-9A-Za-z][0-9A-Za-z._/-]*$'
    and pg_catalog.strpos(p_path, '//') = 0
    and pg_catalog.strpos(p_path, pg_catalog.chr(92)) = 0;
$$;

revoke all on function app_private.account_erasure_storage_path_is_canonical(text)
  from public, anon, authenticated, service_role;

create or replace function public.account_erasure_storage_objects(
  p_user_id uuid
)
returns table(bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_deleted_at timestamptz;
  v_count integer := 0;
  v_object record;
begin
  if p_user_id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select profile.auth_user_id, profile.deleted_at
  into v_auth_user_id, v_deleted_at
  from public.profiles profile
  where profile.id = p_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if v_deleted_at is not null then
    raise exception 'ACCOUNT_ALREADY_ERASED';
  end if;
  if v_auth_user_id is distinct from p_user_id then
    raise exception 'PROFILE_ACCOUNT_MISMATCH';
  end if;

  perform app_private.prepare_dm_media_account_erasure(p_user_id);

  if exists (
    select 1
    from storage.objects object
    where (
      object.owner = p_user_id
      or object.owner_id = p_user_id::text
      or object.name like p_user_id::text || '/%'
    )
      and object.bucket_id not in (
        'profile-photos',
        'private-profile-photos',
        'covers',
        'media',
        'profile-media-quarantine',
        'approved-profile-photos',
        'private-migration-backups'
      )
  ) then
    raise exception 'UNSUPPORTED_STORAGE_BUCKET';
  end if;

  if exists (
    select 1
    from storage.objects object
    where object.bucket_id in (
        'profile-photos',
        'private-profile-photos',
        'covers',
        'media',
        'profile-media-quarantine',
        'approved-profile-photos'
      )
      and (
        object.owner = p_user_id
        or object.owner_id = p_user_id::text
        or object.name like p_user_id::text || '/%'
      )
      and (
        object.name not like p_user_id::text || '/%'
        or not app_private.account_erasure_storage_path_is_canonical(object.name)
        or (object.owner is not null and object.owner <> p_user_id)
        or (object.owner_id is not null and object.owner_id <> p_user_id::text)
      )
  ) then
    raise exception 'INVALID_OR_FOREIGN_STORAGE_OBJECT';
  end if;

  if exists (
    select 1
    from public.private_storage_migration_backups backup
    where (
      backup.original_row ->> 'user_id' = p_user_id::text
      or backup.original_row ->> 'sender_id' = p_user_id::text
      or (
        backup.entity_type = 'profile_photo'
        and exists (
          select 1
          from public.profile_photos photo
          where photo.id = backup.entity_id
            and photo.user_id = p_user_id
        )
      )
    )
      and (
        pg_catalog.jsonb_typeof(backup.backup_objects) is distinct from 'array'
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(backup.backup_objects) = 'array'
              then backup.backup_objects else '[]'::jsonb end
          ) backup_object
          where pg_catalog.jsonb_typeof(backup_object) <> 'object'
             or backup_object - array[
               'source_bucket',
               'source_path',
               'backup_bucket',
               'backup_path'
             ] <> '{}'::jsonb
             or backup_object ->> 'backup_bucket'
               is distinct from 'private-migration-backups'
             or pg_catalog.coalesce(
               backup_object ->> 'source_bucket' in (
                 'profile-photos',
                 'private-profile-photos',
                 'covers',
                 'media',
                 'profile-media-quarantine',
                 'approved-profile-photos'
               ),
               false
             ) is false
             or app_private.account_erasure_storage_path_is_canonical(
               backup_object ->> 'source_path'
             ) is not true
             or app_private.account_erasure_storage_path_is_canonical(
               backup_object ->> 'backup_path'
             ) is not true
        )
      )
  ) then
    raise exception 'INVALID_STORAGE_BACKUP';
  end if;

  for v_object in
    with account_object as (
      select object.bucket_id as bucket, object.name as path
      from storage.objects object
      where object.bucket_id in (
          'profile-photos',
          'private-profile-photos',
          'covers',
          'media',
          'profile-media-quarantine',
          'approved-profile-photos'
        )
        and object.name like p_user_id::text || '/%'
        and (
          object.owner is null
          or object.owner = p_user_id
        )
        and (
          object.owner_id is null
          or object.owner_id = p_user_id::text
        )
      union
      select
        backup_object ->> 'backup_bucket',
        backup_object ->> 'backup_path'
      from public.private_storage_migration_backups backup
      cross join lateral pg_catalog.jsonb_array_elements(
        backup.backup_objects
      ) backup_object
      where (
        backup.original_row ->> 'user_id' = p_user_id::text
        or backup.original_row ->> 'sender_id' = p_user_id::text
        or (
          backup.entity_type = 'profile_photo'
          and exists (
            select 1
            from public.profile_photos photo
            where photo.id = backup.entity_id
              and photo.user_id = p_user_id
          )
        )
      )
    ), removable as (
      select account_object.bucket, account_object.path
      from account_object
      where not (
        account_object.bucket = 'media'
        and exists (
          select 1
          from public.dm_media_account_erasure_dispositions disposition
          where disposition.actor_id = p_user_id
            and disposition.disposition = 'preserve_unclaimed'
            and (
              (
                disposition.preserve_owner_media_prefix
                and account_object.path like p_user_id::text || '/%'
              )
              or account_object.path = disposition.main_path
              or account_object.path = disposition.thumbnail_path
            )
        )
      )
    )
    select removable.bucket, removable.path
    from removable
    order by removable.bucket, removable.path
  loop
    v_count := v_count + 1;
    if v_count > 5000 then
      raise exception 'STORAGE_OBJECT_LIMIT_EXCEEDED';
    end if;
    bucket := v_object.bucket;
    path := v_object.path;
    return next;
  end loop;
end;
$$;

revoke all on function public.account_erasure_storage_objects(uuid)
  from public, anon, authenticated;
grant execute on function public.account_erasure_storage_objects(uuid)
  to service_role;

create or replace function public.queue_account_deletion(
  p_user_id uuid,
  p_stripe_customer_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_job public.account_deletion_jobs%rowtype;
  v_profile_deleted_at timestamptz;
  v_storage_objects jsonb;
begin
  if p_user_id is null then
    return pg_catalog.jsonb_build_object('error', 'PROFILE_NOT_FOUND');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select job.*
  into v_existing_job
  from public.account_deletion_jobs job
  where job.user_id = p_user_id
  for update;

  if found then
    select profile.deleted_at
    into v_profile_deleted_at
    from public.profiles profile
    where profile.id = p_user_id
    for update;

    if not found or v_profile_deleted_at is null then
      raise exception 'ACCOUNT_DELETION_STATE_MISMATCH';
    end if;

    return public.queue_account_deletion(
      p_user_id,
      p_stripe_customer_id,
      '[]'::jsonb
    );
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bucket', snapshot.bucket,
        'path', snapshot.path
      )
      order by snapshot.bucket, snapshot.path
    ),
    '[]'::jsonb
  )
  into v_storage_objects
  from public.account_erasure_storage_objects(p_user_id) snapshot;

  return public.queue_account_deletion(
    p_user_id,
    p_stripe_customer_id,
    v_storage_objects
  );
end;
$$;

revoke all on function public.queue_account_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_account_deletion(uuid, text)
  to service_role;
