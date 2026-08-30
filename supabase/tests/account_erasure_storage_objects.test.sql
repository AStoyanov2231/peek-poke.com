begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select ok(
  pg_catalog.to_regprocedure('public.account_erasure_storage_objects(uuid)') is not null,
  'snapshot RPC exists on a clean migration train'
);
select ok(
  pg_catalog.to_regprocedure('public.queue_account_deletion(uuid,text)') is not null,
  'atomic queue wrapper exists on a clean migration train'
);
select ok(
  (
    select procedure.prosecdef
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'public.account_erasure_storage_objects(uuid)'::pg_catalog.regprocedure
  ),
  'snapshot RPC is SECURITY DEFINER'
);
select is(
  (
    select procedure.proconfig
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'public.account_erasure_storage_objects(uuid)'::pg_catalog.regprocedure
  ),
  array['search_path=""']::text[],
  'snapshot RPC has an empty fixed search_path'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.account_erasure_storage_objects(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.account_erasure_storage_objects(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.account_erasure_storage_objects(uuid)',
    'EXECUTE'
  ),
  'only service_role can execute the snapshot RPC'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.queue_account_deletion(uuid,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.queue_account_deletion(uuid,text)',
    'EXECUTE'
  ),
  'only service_role can execute the atomic queue wrapper'
);

insert into auth.users (id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'snapshot-a@test.invalid'),
  ('81000000-0000-4000-8000-000000000002', 'snapshot-b@test.invalid'),
  ('81000000-0000-4000-8000-000000000003', 'snapshot-auth-c@test.invalid'),
  ('81000000-0000-4000-8000-000000000004', 'snapshot-d@test.invalid'),
  ('81000000-0000-4000-8000-000000000005', 'snapshot-e@test.invalid'),
  ('81000000-0000-4000-8000-000000000006', 'snapshot-f@test.invalid'),
  ('81000000-0000-4000-8000-000000000007', 'snapshot-g@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'snapshot_a'),
  ('81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'snapshot_b'),
  ('81100000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', 'snapshot_c'),
  ('81000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000004', 'snapshot_d'),
  ('81000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000005', 'snapshot_e'),
  ('81000000-0000-4000-8000-000000000006', '81000000-0000-4000-8000-000000000006', 'snapshot_f'),
  ('81000000-0000-4000-8000-000000000007', '81000000-0000-4000-8000-000000000007', 'snapshot_g');

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002'
);

insert into storage.buckets (id, name, public)
values
  ('media', 'media', false),
  ('approved-profile-photos', 'approved-profile-photos', true),
  ('private-migration-backups', 'private-migration-backups', false)
on conflict (id) do nothing;

select throws_ok(
  $$ select * from public.account_erasure_storage_objects(
    '81999999-9999-4999-8999-999999999999'
  ) $$,
  'P0001',
  'PROFILE_NOT_FOUND',
  'unknown target accounts fail closed'
);
select throws_ok(
  $$ select * from public.account_erasure_storage_objects(
    '81100000-0000-4000-8000-000000000003'
  ) $$,
  'P0001',
  'PROFILE_ACCOUNT_MISMATCH',
  'wrong account linkage fails closed'
);
select is(
  (
    select pg_catalog.count(*)
    from public.account_erasure_storage_objects(
      '81000000-0000-4000-8000-000000000002'
    )
  ),
  0::bigint,
  'an account with no objects returns an empty snapshot'
);

insert into public.private_storage_migration_backups (
  run_id,
  entity_type,
  entity_id,
  original_row,
  backup_objects
)
values (
  'snapshot-test',
  'profile_photo',
  '83000000-0000-4000-8000-000000000001',
  '{"user_id":"81000000-0000-4000-8000-000000000002"}'::jsonb,
  '[
    {
      "source_bucket":"profile-photos",
      "source_path":"81000000-0000-4000-8000-000000000002/photo.jpg",
      "backup_bucket":"private-migration-backups",
      "backup_path":"snapshot-test/profile-photos/photo.jpg"
    },
    {
      "source_bucket":"profile-photos",
      "source_path":"81000000-0000-4000-8000-000000000002/photo.jpg",
      "backup_bucket":"private-migration-backups",
      "backup_path":"snapshot-test/profile-photos/photo.jpg"
    }
  ]'::jsonb
);
select is(
  (
    select pg_catalog.count(*)
    from public.account_erasure_storage_objects(
      '81000000-0000-4000-8000-000000000002'
    )
  ),
  1::bigint,
  'duplicate backup rows collapse to one object'
);

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values (
  '84000000-0000-4000-8000-000000000004',
  'approved-profile-photos',
  '81000000-0000-4000-8000-000000000004/../bad.jpg',
  'bad-v1',
  '{}'::jsonb,
  '{}'::jsonb
);
select throws_ok(
  $$ select * from public.account_erasure_storage_objects(
    '81000000-0000-4000-8000-000000000004'
  ) $$,
  'P0001',
  'INVALID_OR_FOREIGN_STORAGE_OBJECT',
  'malformed paths fail closed'
);

insert into storage.objects (
  id, bucket_id, name, owner, version, metadata, user_metadata
)
values (
  '84000000-0000-4000-8000-000000000005',
  'approved-profile-photos',
  '81000000-0000-4000-8000-000000000007/foreign.jpg',
  '81000000-0000-4000-8000-000000000005',
  'foreign-v1',
  '{}'::jsonb,
  '{}'::jsonb
);
select throws_ok(
  $$ select * from public.account_erasure_storage_objects(
    '81000000-0000-4000-8000-000000000005'
  ) $$,
  'P0001',
  'INVALID_OR_FOREIGN_STORAGE_OBJECT',
  'foreign-owned paths fail closed'
);

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values
  (
    '84000000-0000-4000-8000-000000000011',
    'media',
    '81000000-0000-4000-8000-000000000001/1722501400001-111e8400-e29b-41d4-a716-446655440000.jpg',
    'claimed-v1',
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '84000000-0000-4000-8000-000000000012',
    'media',
    '81000000-0000-4000-8000-000000000001/1722501400002-222e8400-e29b-41d4-a716-446655440000.jpg',
    'legacy-v1',
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '84000000-0000-4000-8000-000000000013',
    'approved-profile-photos',
    '81000000-0000-4000-8000-000000000001/profile.jpg',
    'profile-v1',
    '{}'::jsonb,
    '{}'::jsonb
  );

create temporary table snapshot_messages (name text primary key, id uuid not null);
insert into snapshot_messages (name, id)
select 'claimed', (
  public.send_message_transactional(
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000001',
    'Claimed snapshot photo',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/81000000-0000-4000-8000-000000000001/1722501400001-111e8400-e29b-41d4-a716-446655440000.jpg',
    null
  ) #>> '{message,id}'
)::uuid;
insert into public.dm_messages (
  id, thread_id, sender_id, client_id, sequence, content, message_type, media_url
)
values (
  '86000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000002',
  900001,
  'Legacy unclaimed photo',
  'image',
  'https://project.supabase.co/storage/v1/object/public/media/81000000-0000-4000-8000-000000000001/1722501400002-222e8400-e29b-41d4-a716-446655440000.jpg'
);

select is(
  (
    select pg_catalog.count(*)
    from public.account_erasure_storage_objects(
      '81000000-0000-4000-8000-000000000001'
    ) snapshot
    where snapshot.bucket = 'media'
      and snapshot.path like '%1722501400002-%'
  ),
  0::bigint,
  'preserved legacy DM media is excluded'
);
select is(
  (
    select pg_catalog.count(*)
    from public.account_erasure_storage_objects(
      '81000000-0000-4000-8000-000000000001'
    ) snapshot
    where snapshot.bucket = 'media'
      and snapshot.path like '%1722501400001-%'
  ),
  1::bigint,
  'claimed DM media remains in the cleanup snapshot'
);

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
select
  gen_random_uuid(),
  'approved-profile-photos',
  '81000000-0000-4000-8000-000000000006/file-' || series::text || '.jpg',
  'bounded-v1',
  '{}'::jsonb,
  '{}'::jsonb
from pg_catalog.generate_series(1, 5001) series;
select throws_ok(
  $$ select * from public.account_erasure_storage_objects(
    '81000000-0000-4000-8000-000000000006'
  ) $$,
  'P0001',
  'STORAGE_OBJECT_LIMIT_EXCEEDED',
  'the bounded snapshot rejects object 5001'
);

create temporary table snapshot_queue_result as
select public.queue_account_deletion(
  '81000000-0000-4000-8000-000000000001',
  null
) as result;
select is(
  (select result ->> 'success' from snapshot_queue_result),
  'true',
  'the atomic wrapper queues account erasure successfully'
);
select is(
  (
    select job.storage_objects
    from public.account_deletion_jobs job
    where job.user_id = '81000000-0000-4000-8000-000000000001'
  ),
  '[
    {"bucket":"approved-profile-photos","path":"81000000-0000-4000-8000-000000000001/profile.jpg"},
    {"bucket":"media","path":"81000000-0000-4000-8000-000000000001/1722501400001-111e8400-e29b-41d4-a716-446655440000.jpg"}
  ]'::jsonb,
  'the atomic wrapper persists its exact snapshot'
);

create temporary table snapshot_queue_retry as
select public.queue_account_deletion(
  '81000000-0000-4000-8000-000000000001',
  null
) as result;
select ok(
  (select result ->> 'job_id' from snapshot_queue_retry)
    = (select result ->> 'job_id' from snapshot_queue_result)
  and (
    select pg_catalog.count(*) = 1
    from public.outbox_events event
    where event.event_type = 'account.cleanup'
      and event.aggregate_id = (
        select result ->> 'job_id' from snapshot_queue_result
      )
  ),
  'lost-response retry returns the same job without duplicate work'
);

select * from finish();
rollback;
