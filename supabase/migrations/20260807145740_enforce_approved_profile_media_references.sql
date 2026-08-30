alter table public.profile_photos
  add column if not exists is_cover boolean not null default false;

update public.profile_photos pp
set is_cover = true
from public.profiles p
where p.id = pp.user_id
  and p.cover_image_url = pp.url
  and pp.approval_status = 'approved'
  and pp.is_private = false;

update public.profile_photos
set is_avatar = false,
    is_cover = false
where approval_status <> 'approved'
   or is_private = true;

update public.profile_photos
set is_cover = false
where is_avatar = true and is_cover = true;

update public.profiles p
set avatar_url = null
where p.avatar_url is not null
  and not exists (
    select 1
    from public.profile_photos pp
    where pp.user_id = p.id
      and pp.url = p.avatar_url
      and pp.approval_status = 'approved'
      and pp.is_private = false
      and pp.is_avatar = true
  );

update public.profiles p
set cover_image_url = null
where p.cover_image_url is not null
  and not exists (
    select 1
    from public.profile_photos pp
    where pp.user_id = p.id
      and pp.url = p.cover_image_url
      and pp.approval_status = 'approved'
      and pp.is_private = false
      and pp.is_cover = true
  );

alter table public.profile_photos
  drop constraint if exists profile_photos_public_featured_media_check;

alter table public.profile_photos
  add constraint profile_photos_public_featured_media_check
  check (
    not (is_private and (is_avatar or is_cover))
    and not (is_avatar and is_cover)
  );

create unique index if not exists profile_photos_one_active_avatar_idx
  on public.profile_photos (user_id)
  where is_avatar = true
    and is_private = false
    and approval_status = 'approved';

create unique index if not exists profile_photos_one_active_cover_idx
  on public.profile_photos (user_id)
  where is_cover = true
    and is_private = false
    and approval_status = 'approved';

create or replace function public.guard_profile_media_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.avatar_url is not null and not exists (
    select 1
    from public.profile_photos pp
    where pp.user_id = new.id
      and pp.url = new.avatar_url
      and pp.approval_status = 'approved'
      and pp.is_private = false
      and pp.is_avatar = true
  ) then
    new.avatar_url := null;
  end if;

  if new.cover_image_url is not null and not exists (
    select 1
    from public.profile_photos pp
    where pp.user_id = new.id
      and pp.url = new.cover_image_url
      and pp.approval_status = 'approved'
      and pp.is_private = false
      and pp.is_cover = true
  ) then
    new.cover_image_url := null;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_media_references on public.profiles;
create trigger guard_profile_media_references
before insert or update
on public.profiles
for each row
execute function public.guard_profile_media_references();

create or replace function public.sync_profile_media_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles
    set avatar_url = case when avatar_url = old.url then null else avatar_url end,
        cover_image_url = case when cover_image_url = old.url then null else cover_image_url end
    where id = old.user_id
      and (avatar_url = old.url or cover_image_url = old.url);
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.user_id is distinct from new.user_id
    or old.url is distinct from new.url
    or old.approval_status is distinct from new.approval_status
    or old.is_private is distinct from new.is_private
    or old.is_avatar is distinct from new.is_avatar
    or old.is_cover is distinct from new.is_cover
  ) then
    update public.profiles
    set avatar_url = case when avatar_url = old.url then null else avatar_url end,
        cover_image_url = case when cover_image_url = old.url then null else cover_image_url end
    where id = old.user_id
      and (avatar_url = old.url or cover_image_url = old.url);
  end if;

  if new.approval_status = 'approved' and new.is_private = false then
    if new.is_avatar then
      update public.profiles set avatar_url = new.url where id = new.user_id;
    end if;
    if new.is_cover then
      update public.profiles set cover_image_url = new.url where id = new.user_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_profile_media_references on public.profile_photos;
create trigger sync_profile_media_references
after insert or update or delete
on public.profile_photos
for each row
execute function public.sync_profile_media_references();

create or replace function public.moderate_profile_photo(
  p_photo_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_MODERATION_ACTION';
  end if;

  select * into v_photo
  from public.profile_photos
  where id = p_photo_id
  for update;

  if not found then
    return jsonb_build_object('error', 'PHOTO_NOT_FOUND', 'status', 404);
  end if;

  perform 1 from public.profiles where id = v_photo.user_id for update;

  if p_action = 'approve' and v_photo.is_cover then
    update public.profile_photos
    set is_cover = false
    where user_id = v_photo.user_id
      and id <> v_photo.id
      and is_cover = true;
  end if;

  update public.profile_photos
  set approval_status = case
        when p_action = 'approve' then 'approved'::public.photo_approval_status
        else 'rejected'::public.photo_approval_status
      end,
      is_avatar = case when p_action = 'reject' then false else is_avatar end,
      is_cover = case when p_action = 'reject' then false else is_cover end,
      reviewed_by = p_reviewer_id,
      reviewed_at = timezone('utc', now()),
      rejection_reason = case when p_action = 'reject' then nullif(btrim(p_reason), '') else null end
  where id = p_photo_id
  returning * into v_photo;

  return to_jsonb(v_photo);
end;
$$;

create or replace function public.set_avatar(p_user_id uuid, p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Photo not found', 'status', 404);
  end if;
  if v_photo.approval_status <> 'approved' then
    return jsonb_build_object('error', 'Photo must be approved before it can be set as avatar.', 'status', 400);
  end if;
  if v_photo.is_private then
    return jsonb_build_object('error', 'Cannot set a private photo as avatar. Make the photo public first.', 'status', 400);
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  update public.profile_photos set is_avatar = false where user_id = p_user_id and is_avatar = true;
  update public.profile_photos
  set is_avatar = true
  where id = p_photo_id and user_id = p_user_id
  returning * into v_photo;
  return to_jsonb(v_photo);
end;
$$;

create or replace function public.delete_photo(p_user_id uuid, p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.profile_photos%rowtype;
begin
  select * into v_photo
  from public.profile_photos
  where id = p_photo_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Photo not found', 'status', 404);
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  delete from public.profile_photos where id = p_photo_id and user_id = p_user_id;
  return jsonb_build_object(
    'storage_path', v_photo.storage_path,
    'storage_bucket', v_photo.storage_bucket,
    'thumbnail_storage_path', v_photo.thumbnail_storage_path,
    'thumbnail_url', v_photo.thumbnail_url
  );
end;
$$;

revoke all on function public.guard_profile_media_references() from public, anon, authenticated;
revoke all on function public.sync_profile_media_references() from public, anon, authenticated;
revoke all on function public.moderate_profile_photo(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_avatar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_photo(uuid, uuid) from public, anon, authenticated;

grant execute on function public.moderate_profile_photo(uuid, uuid, text, text) to service_role;
grant execute on function public.set_avatar(uuid, uuid) to service_role;
grant execute on function public.delete_photo(uuid, uuid) to service_role;
