alter table public.push_devices
  add column if not exists owner_session_id uuid,
  add column if not exists owner_session_created_at timestamptz;

alter table public.push_devices
  drop constraint if exists push_devices_owner_session_pair_check;

alter table public.push_devices
  add constraint push_devices_owner_session_pair_check
  check (
    (owner_session_id is null and owner_session_created_at is null)
    or (owner_session_id is not null and owner_session_created_at is not null)
  );

create or replace function public.upsert_push_device_v2(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_provider text,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_created_at timestamptz;
  v_rows bigint;
begin
  if p_platform not in ('ios', 'android')
     or p_provider not in ('expo', 'apns', 'fcm')
     or nullif(p_token, '') is null then
    raise exception 'Invalid push device';
  end if;

  select auth_session.created_at
  into v_session_created_at
  from auth.sessions as auth_session
  where auth_session.id = p_session_id
    and auth_session.user_id = p_user_id;

  if v_session_created_at is null then
    raise exception 'Invalid authenticated session' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_token, 0)
  );

  insert into public.push_devices (
    user_id,
    token,
    platform,
    provider,
    revoked_at,
    last_registered_at,
    owner_session_id,
    owner_session_created_at
  )
  values (
    p_user_id,
    p_token,
    p_platform,
    p_provider,
    null,
    now(),
    p_session_id,
    v_session_created_at
  )
  on conflict (token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    provider = excluded.provider,
    revoked_at = null,
    last_registered_at = now(),
    owner_session_id = excluded.owner_session_id,
    owner_session_created_at = excluded.owner_session_created_at
  where public.push_devices.owner_session_created_at is null
    or excluded.owner_session_created_at > public.push_devices.owner_session_created_at
    or (
      excluded.owner_session_created_at = public.push_devices.owner_session_created_at
      and excluded.owner_session_id >= public.push_devices.owner_session_id
    );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.revoke_push_device_v2(
  p_user_id uuid,
  p_token text,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_exists boolean;
  v_rows bigint;
begin
  select exists (
    select 1
    from auth.sessions as auth_session
    where auth_session.id = p_session_id
      and auth_session.user_id = p_user_id
  ) into v_session_exists;

  if not v_session_exists then
    raise exception 'Invalid authenticated session' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_token, 0)
  );

  update public.push_devices
  set revoked_at = now()
  where user_id = p_user_id
    and token = p_token
    and owner_session_id = p_session_id
    and revoked_at is null;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Keep the legacy signatures present so old API instances receive a hard
-- database error instead of treating PGRST202 as permission to fall back to an
-- even older unfenced function during the migration-first rollout.
create or replace function public.upsert_push_device(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Legacy push device mutation is disabled'
    using errcode = '0A000';
end;
$$;

create or replace function public.revoke_push_device(
  p_user_id uuid,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Legacy push device mutation is disabled'
    using errcode = '0A000';
end;
$$;

revoke all on function public.upsert_push_device(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_push_device(uuid, text)
  from public, anon, authenticated, service_role;

-- Some pre-baseline projects exposed older fallback names. Revoke every
-- overload without assuming those functions exist in a clean installation.
do $$
declare
  legacy_signature text;
begin
  for legacy_signature in
    select pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      proc.proname,
      pg_catalog.pg_get_function_identity_arguments(proc.oid)
    )
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname in ('upsert_push_token', 'delete_push_token')
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      legacy_signature
    );
  end loop;
end;
$$;

revoke all on function public.upsert_push_device_v2(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_push_device_v2(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.upsert_push_device_v2(uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.revoke_push_device_v2(uuid, text, uuid)
  to service_role;
