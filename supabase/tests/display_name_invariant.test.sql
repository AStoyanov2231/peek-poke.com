begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email)
values ('30000000-0000-4000-8000-000000000001', 'display-name-invariant@test.invalid');

insert into public.profiles (id, auth_user_id, username, display_name)
values (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'display_name_test',
  null
);

select has_check(
  'public',
  'profiles',
  'profiles_display_name_canonical_check',
  'profiles has the canonical display-name constraint'
);

select lives_ok(
  $$update public.profiles set display_name = null where id = '30000000-0000-4000-8000-000000000001'$$,
  'NULL remains the supported optional-name state'
);
select lives_ok(
  $$update public.profiles set display_name = 'Élodie' where id = '30000000-0000-4000-8000-000000000001'$$,
  'NFC combining characters are accepted'
);
select lives_ok(
  $$update public.profiles set display_name = repeat('😀', 50) where id = '30000000-0000-4000-8000-000000000001'$$,
  '50 supplementary-plane code points are accepted'
);

select throws_ok(
  $$update public.profiles set display_name = '' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'empty names are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = ' Ada' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'leading ASCII whitespace is rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\00A0' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'trailing Unicode whitespace is rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'E\0301lodie' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'non-NFC combining sequences are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = repeat('😀', 51) where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, '51 supplementary-plane code points are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\0001Lovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'C0 controls are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\009FLovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'C1 controls are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\200BLovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'zero-width spacing controls are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\061CLovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Arabic letter mark bidi formatting is rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\200ELovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'left-to-right bidi marks are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\200FLovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'right-to-left bidi marks are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\202ELovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'bidi overrides are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\2066Lovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'bidi isolates are rejected'
);
select throws_ok(
  $$update public.profiles set display_name = U&'Ada\2028Lovelace' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Unicode line separators are rejected'
);
select lives_ok(
  $$update public.profiles set display_name = U&'Family \D83D\DC69\200D\D83D\DC69\200D\D83D\DC67' where id = '30000000-0000-4000-8000-000000000001'$$,
  'valid emoji ZWJ sequences remain accepted'
);
select is(
  (select pg_catalog.char_length(display_name) from public.profiles where id = '30000000-0000-4000-8000-000000000001'),
  12,
  'PostgreSQL counts the stored emoji sequence by Unicode code point'
);

select * from finish();
rollback;
