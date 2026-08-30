-- Keep stored display names compatible with every strict API client. NULL
-- remains the supported "no display name yet" state; every non-NULL value is
-- canonical, printable, non-empty, and bounded.

lock table public.profiles in share row exclusive mode;

do $migration$
declare
  incompatible_count bigint;
  incompatible_sample text;
begin
  select pg_catalog.count(*)
  into incompatible_count
  from public.profiles profile
  where profile.display_name is not null
    and not (
      pg_catalog.char_length(profile.display_name) between 1 and 50
      and profile.display_name = pg_catalog.btrim(
        profile.display_name,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      and profile.display_name = pg_catalog.normalize(profile.display_name, 'NFC')
      and profile.display_name !~ U&'[\0001-\001F\007F-\009F\061C\200B\200C\200E\200F\2028\2029\202A-\202E\2066-\2069]'
    );

  if incompatible_count > 0 then
    select pg_catalog.string_agg(incompatible.id::text, ', ' order by incompatible.id)
    into incompatible_sample
    from (
      select profile.id
      from public.profiles profile
      where profile.display_name is not null
        and not (
          pg_catalog.char_length(profile.display_name) between 1 and 50
          and profile.display_name = pg_catalog.btrim(
            profile.display_name,
            U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
          )
          and profile.display_name = pg_catalog.normalize(profile.display_name, 'NFC')
          and profile.display_name !~ U&'[\0001-\001F\007F-\009F\061C\200B\200C\200E\200F\2028\2029\202A-\202E\2066-\2069]'
        )
      order by profile.id
      limit 10
    ) incompatible;

    raise exception using
      errcode = 'check_violation',
      message = pg_catalog.format(
        'Cannot enforce profiles display-name invariant: %s incompatible row(s)',
        incompatible_count
      ),
      detail = pg_catalog.format('Sample profile ids: %s', incompatible_sample),
      hint = 'Correct incompatible display_name values explicitly, then rerun the migration; no values were rewritten.';
  end if;
end
$migration$;

alter table public.profiles
  add constraint profiles_display_name_canonical_check
  check (
    display_name is null
    or (
      pg_catalog.char_length(display_name) between 1 and 50
      and display_name = pg_catalog.btrim(
        display_name,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      and display_name = pg_catalog.normalize(display_name, 'NFC')
      and display_name !~ U&'[\0001-\001F\007F-\009F\061C\200B\200C\200E\200F\2028\2029\202A-\202E\2066-\2069]'
    )
  );
