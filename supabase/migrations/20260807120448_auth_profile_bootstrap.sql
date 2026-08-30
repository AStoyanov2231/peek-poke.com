-- Keep the authenticated Auth-to-profile boundary reproducible. Profile
-- creation happens only after a validated session calls the idempotent backend
-- endpoint; unconfirmed signups with no session do not create business data.

alter table public.profiles
  add column if not exists auth_user_id uuid;

update public.profiles profile
set auth_user_id = profile.id
where profile.deleted_at is null
  and profile.auth_user_id is null
  and exists (
    select 1
    from auth.users auth_user
    where auth_user.id = profile.id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_auth_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_active_auth_link_check'
  ) then
    alter table public.profiles
      add constraint profiles_active_auth_link_check
      check (deleted_at is not null or auth_user_id is not null)
      not valid;
  end if;
end
$$;

alter table public.profiles
  validate constraint profiles_active_auth_link_check;

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

insert into public.user_roles (user_id, role_id)
select profile.id, role.id
from public.profiles profile
cross join public.roles role
where profile.deleted_at is null
  and profile.auth_user_id = profile.id
  and role.name = 'user'
on conflict (user_id, role_id) do nothing;

-- The backend calls this service-role-only function after validating the Auth
-- session. Profile creation and the default role are one database transaction:
-- a missing role or failed role insert rolls the profile insert back.
create or replace function public.ensure_auth_profile_with_default_role(
  p_auth_user_id uuid,
  p_username text,
  p_display_name text
)
returns table (
  id uuid,
  onboarding_completed boolean,
  deleted_at timestamptz,
  auth_user_id uuid,
  created boolean,
  user_role_assigned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ensured_profile public.profiles%rowtype;
  default_role_id public.roles.id%type;
  profile_created boolean := false;
begin
  if p_auth_user_id is null then
    raise exception 'Auth user is required' using errcode = '22023';
  end if;
  if p_username is null
    or p_username !~ '^user_[a-f0-9]{15}$'
    or char_length(p_username) > 20
  then
    raise exception 'Invalid temporary username' using errcode = '22023';
  end if;
  if p_display_name is not null and char_length(p_display_name) > 50 then
    raise exception 'Invalid display name' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and (
        auth_user.banned_until is null
        or auth_user.banned_until <= now()
      )
  ) then
    raise exception 'Auth user is not active' using errcode = '42501';
  end if;

  select profile.*
  into ensured_profile
  from public.profiles profile
  where profile.id = p_auth_user_id
  for update;

  if found then
    if ensured_profile.deleted_at is not null
      or ensured_profile.auth_user_id is distinct from p_auth_user_id
    then
      return query
      select
        ensured_profile.id,
        ensured_profile.onboarding_completed,
        ensured_profile.deleted_at,
        ensured_profile.auth_user_id,
        false,
        false;
      return;
    end if;
  else
    insert into public.profiles (
      id,
      auth_user_id,
      username,
      display_name,
      avatar_url,
      onboarding_completed
    )
    values (
      p_auth_user_id,
      p_auth_user_id,
      p_username,
      p_display_name,
      null,
      false
    )
    returning * into ensured_profile;
    profile_created := true;
  end if;

  select role.id
  into default_role_id
  from public.roles role
  where role.name = 'user';

  if default_role_id is null then
    raise exception 'Default user role is missing' using errcode = 'P0001';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (ensured_profile.id, default_role_id)
  on conflict (user_id, role_id) do nothing;

  if not exists (
    select 1
    from public.user_roles user_role
    where user_role.user_id = ensured_profile.id
      and user_role.role_id = default_role_id
  ) then
    raise exception 'Default user role assignment failed' using errcode = 'P0001';
  end if;

  return query
  select
    ensured_profile.id,
    ensured_profile.onboarding_completed,
    ensured_profile.deleted_at,
    ensured_profile.auth_user_id,
    profile_created,
    true;
end;
$$;

revoke execute on function public.ensure_auth_profile_with_default_role(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_auth_profile_with_default_role(uuid, text, text)
  to service_role;
