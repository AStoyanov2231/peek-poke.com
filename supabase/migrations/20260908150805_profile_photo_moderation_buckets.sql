-- The legacy constraint rejects the destinations used by durable moderation.
-- Preserve the existing bucket allowlist and admit only the two workflow buckets.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.profile_photos in access exclusive mode;

do $migration$
declare
  current_definition text;
begin
  select pg_get_constraintdef(oid, true)
  into current_definition
  from pg_constraint
  where conrelid = 'public.profile_photos'::regclass
    and conname = 'profile_photos_storage_bucket_check';

  if current_definition is distinct from
     'CHECK (storage_bucket = ANY (ARRAY[''profile-photos''::text, ''private-profile-photos''::text]))' then
    raise exception 'Unexpected profile photo bucket constraint; review before migration';
  end if;
end
$migration$;

alter table public.profile_photos
  drop constraint profile_photos_storage_bucket_check,
  add constraint profile_photos_storage_bucket_check check (
    storage_bucket in (
      'profile-photos',
      'private-profile-photos',
      'approved-profile-photos',
      'profile-media-quarantine'
    )
  );

commit;
