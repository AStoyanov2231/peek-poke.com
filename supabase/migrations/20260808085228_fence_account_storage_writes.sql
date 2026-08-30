-- Storage HTTP operations cannot share a Postgres transaction. A durable
-- account-scoped write fence spans the Storage mutation and its owning database
-- commit. Account deletion takes the same advisory lock and fails retryably
-- while a writer is active.
do $$
begin
  if pg_catalog.to_regclass('public.account_deletion_jobs') is null
     or pg_catalog.to_regprocedure(
       'public.queue_account_deletion(uuid,text,jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.account_erasure_storage_objects(uuid)'
     ) is null then
    raise exception 'atomic account Storage snapshot migration must be applied first';
  end if;
end;
$$;

create table if not exists public.account_storage_write_operations (
  operation_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation_kind text not null check (operation_kind in (
    'dm_upload',
    'profile_photo_upload',
    'profile_cover_upload',
    'profile_photo_move',
    'profile_media_moderation'
  )),
  status text not null default 'active' check (status in (
    'active',
    'completed',
    'aborted'
  )),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  finished_at timestamptz,
  check (
    (status = 'active' and finished_at is null)
    or (status in ('completed', 'aborted') and finished_at is not null)
  )
);

create index if not exists account_storage_write_operations_active_user_idx
  on public.account_storage_write_operations (user_id, created_at)
  where status = 'active';

alter table public.account_storage_write_operations enable row level security;
drop policy if exists "account Storage write operations are server internal"
  on public.account_storage_write_operations;
create policy "account Storage write operations are server internal"
  on public.account_storage_write_operations
  for all
  to authenticated
  using (false)
  with check (false);
revoke all on public.account_storage_write_operations
  from public, anon, authenticated, service_role;

create or replace function app_private.enforce_account_storage_write_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or new.operation_id is distinct from old.operation_id
     or new.user_id is distinct from old.user_id
     or new.operation_kind is distinct from old.operation_kind
     or new.created_at is distinct from old.created_at
     or old.status <> 'active'
     or new.status not in ('completed', 'aborted')
     or new.finished_at is null then
    raise exception 'Account Storage write operation is immutable';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_account_storage_write_transition()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_account_storage_write_transition
  on public.account_storage_write_operations;
create trigger enforce_account_storage_write_transition
before update or delete on public.account_storage_write_operations
for each row execute function app_private.enforce_account_storage_write_transition();

create or replace function public.begin_account_storage_write(
  p_user_id uuid,
  p_operation_id uuid,
  p_operation_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.account_storage_write_operations%rowtype;
begin
  if p_user_id is null or p_operation_id is null
     or p_operation_kind not in (
       'dm_upload',
       'profile_photo_upload',
       'profile_cover_upload',
       'profile_photo_move',
       'profile_media_moderation'
     ) then
    return pg_catalog.jsonb_build_object('error', 'INVALID_STORAGE_WRITE');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  perform profile.id
  from public.profiles profile
  where profile.id = p_user_id
    and profile.auth_user_id = p_user_id
    and profile.deleted_at is null
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'error', 'ACCOUNT_DELETION_IN_PROGRESS',
      'status', 409
    );
  end if;

  insert into public.account_storage_write_operations (
    operation_id,
    user_id,
    operation_kind
  )
  values (p_operation_id, p_user_id, p_operation_kind)
  on conflict (operation_id) do nothing;

  select operation.*
  into v_operation
  from public.account_storage_write_operations operation
  where operation.operation_id = p_operation_id
  for update;

  if v_operation.user_id is distinct from p_user_id
     or v_operation.operation_kind is distinct from p_operation_kind then
    raise exception 'Account Storage write operation ID was reused';
  end if;
  if v_operation.status = 'aborted' then
    return pg_catalog.jsonb_build_object('error', 'STORAGE_WRITE_ABORTED');
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'deduplicated', v_operation.status = 'completed',
    'status', v_operation.status
  );
end;
$$;

create or replace function public.finish_account_storage_write(
  p_user_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.account_storage_write_operations%rowtype;
begin
  if p_user_id is null or p_operation_id is null then
    return pg_catalog.jsonb_build_object('error', 'INVALID_STORAGE_WRITE');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select operation.*
  into v_operation
  from public.account_storage_write_operations operation
  where operation.operation_id = p_operation_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'STORAGE_WRITE_NOT_FOUND');
  end if;
  if v_operation.user_id is distinct from p_user_id then
    raise exception 'Account Storage write operation belongs to another account';
  end if;
  if v_operation.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'operation_id', p_operation_id,
      'deduplicated', true
    );
  end if;
  if v_operation.status = 'aborted' then
    return pg_catalog.jsonb_build_object('error', 'STORAGE_WRITE_ABORTED');
  end if;

  perform profile.id
  from public.profiles profile
  where profile.id = p_user_id
    and profile.auth_user_id = p_user_id
    and profile.deleted_at is null
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'error', 'ACCOUNT_DELETION_IN_PROGRESS',
      'status', 409
    );
  end if;

  update public.account_storage_write_operations operation
  set status = 'completed',
      finished_at = pg_catalog.clock_timestamp()
  where operation.operation_id = p_operation_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'deduplicated', false
  );
end;
$$;

create or replace function public.abort_account_storage_write(
  p_user_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.account_storage_write_operations%rowtype;
begin
  if p_user_id is null or p_operation_id is null then
    return pg_catalog.jsonb_build_object('error', 'INVALID_STORAGE_WRITE');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select operation.*
  into v_operation
  from public.account_storage_write_operations operation
  where operation.operation_id = p_operation_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'operation_id', p_operation_id,
      'deduplicated', true
    );
  end if;
  if v_operation.user_id is distinct from p_user_id then
    raise exception 'Account Storage write operation belongs to another account';
  end if;
  if v_operation.status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'success', v_operation.status = 'aborted',
      'operation_id', p_operation_id,
      'deduplicated', true,
      'status', v_operation.status
    );
  end if;

  update public.account_storage_write_operations operation
  set status = 'aborted',
      finished_at = pg_catalog.clock_timestamp()
  where operation.operation_id = p_operation_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'deduplicated', false
  );
end;
$$;

revoke all on function public.begin_account_storage_write(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.finish_account_storage_write(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.abort_account_storage_write(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_account_storage_write(uuid, uuid, text)
  to service_role;
grant execute on function public.finish_account_storage_write(uuid, uuid)
  to service_role;
grant execute on function public.abort_account_storage_write(uuid, uuid)
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

  if exists (
    select 1
    from public.account_storage_write_operations operation
    where operation.user_id = p_user_id
      and operation.status = 'active'
  ) then
    return pg_catalog.jsonb_build_object(
      'error', 'ACCOUNT_STORAGE_WRITE_IN_PROGRESS',
      'status', 409
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
