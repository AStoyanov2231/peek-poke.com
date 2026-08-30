begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email)
values
  ('70000000-0000-4000-8000-000000000001', 'erase-a@test.invalid'),
  ('70000000-0000-4000-8000-000000000002', 'erase-b@test.invalid'),
  ('70000000-0000-4000-8000-000000000003', 'erase-c@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'erase_a'),
  ('70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'erase_b'),
  ('70000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'erase_c');

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000003'
  );

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values
  (
    '72000000-0000-4000-8000-000000000001',
    'media',
    '70000000-0000-4000-8000-000000000001/1722501300001-111e8400-e29b-41d4-a716-446655440000.jpg',
    'claimed-v1',
    '{"eTag":"claimed","size":100}'::jsonb,
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'media',
    '70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg',
    'shared-v1',
    '{"eTag":"shared","size":120}'::jsonb,
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    'media',
    '70000000-0000-4000-8000-000000000001/legacy-file.jpg',
    'legacy-v1',
    '{"eTag":"legacy","size":80}'::jsonb,
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'media',
    '70000000-0000-4000-8000-000000000002/1722501300003-333e8400-e29b-41d4-a716-446655440000.jpg',
    'normal-v1',
    '{"eTag":"normal","size":90}'::jsonb,
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    'media',
    '70000000-0000-4000-8000-000000000002/1722501300004-444e8400-e29b-41d4-a716-446655440000.jpg',
    'unclaimed-v1',
    '{"eTag":"unclaimed","size":70}'::jsonb,
    '{}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    'media',
    '70000000-0000-4000-8000-000000000003/1722501300005-555e8400-e29b-41d4-a716-446655440000.jpg',
    'rollback-v1',
    '{"eTag":"rollback","size":75}'::jsonb,
    '{}'::jsonb
  );

create temporary table account_erasure_messages (
  name text primary key,
  id uuid not null
);

insert into account_erasure_messages (name, id)
select
  'claimed',
  (public.send_message_transactional(
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'Claimed account photo',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000001/1722501300001-111e8400-e29b-41d4-a716-446655440000.jpg',
    null
  ) #>> '{message,id}')::uuid;

insert into account_erasure_messages (name, id)
select
  'rollback',
  (public.send_message_transactional(
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000008',
    'Rollback claimed photo',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000003/1722501300005-555e8400-e29b-41d4-a716-446655440000.jpg',
    null
  ) #>> '{message,id}')::uuid;

insert into public.dm_messages (
  id, thread_id, sender_id, client_id, sequence, content, message_type, media_url
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002',
    900001,
    'Shared legacy A',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003',
    900002,
    'Shared legacy B',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg'
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000004',
    900003,
    'Signed legacy path',
    'image',
    'https://project.supabase.co/storage/v1/object/sign/media/70000000-0000-4000-8000-000000000001/legacy-file.jpg?token=legacy'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000005',
    900004,
    'Plain text',
    'text',
    null
  );

select is(
  public.queue_account_deletion(
    '70000000-0000-4000-8000-000000000001',
    null,
    '[{"bucket":"media","path":"70000000-0000-4000-8000-000000000002/1722501300003-333e8400-e29b-41d4-a716-446655440000.jpg"}]'::jsonb
  ) ->> 'error',
  'STORAGE_OBJECT_OWNERSHIP_MISMATCH',
  'wrong-account Storage objects are rejected before erasure'
);
select ok(
  (select deleted_at is null from public.profiles where id = '70000000-0000-4000-8000-000000000001')
  and not exists (
    select 1 from public.account_deletion_jobs
    where user_id = '70000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.dm_media_account_erasure_dispositions
    where actor_id = '70000000-0000-4000-8000-000000000001'
  ),
  'a rejected queue attempt leaves profile, job, and evidence unchanged'
);

create temporary table account_erasure_result as
select public.queue_account_deletion(
  '70000000-0000-4000-8000-000000000001',
  null,
  '[
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/1722501300001-111e8400-e29b-41d4-a716-446655440000.jpg"},
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg"},
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/legacy-file.jpg"}
  ]'::jsonb
) as result;

select is(
  (select result ->> 'success' from account_erasure_result),
  'true',
  'mixed account erasure queues successfully'
);
select is(
  (
    select count(*)
    from public.dm_messages message
    where message.sender_id = '70000000-0000-4000-8000-000000000001'
      and message.is_deleted
      and message.content is null
      and message.media_url is null
      and message.media_thumbnail_url is null
  ),
  5::bigint,
  'account erasure tombstones claimed, duplicate, invalid, and text messages together'
);
select is(
  (
    select count(*)
    from public.dm_media_account_erasure_dispositions disposition
    where disposition.actor_id = '70000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'every original media row retains immutable erasure evidence'
);
select is(
  (
    select count(*)
    from public.dm_media_account_erasure_dispositions disposition
    where disposition.actor_id = '70000000-0000-4000-8000-000000000001'
      and disposition.disposition = 'claimed_account_cleanup'
  ),
  1::bigint,
  'the exclusive generation remains eligible for account cleanup'
);
select is(
  (
    select count(*)
    from public.dm_media_account_erasure_dispositions disposition
    where disposition.actor_id = '70000000-0000-4000-8000-000000000001'
      and disposition.disposition = 'preserve_unclaimed'
  ),
  3::bigint,
  'duplicate and invalid legacy media fail closed as preserved'
);
select ok(
  (
    select claim.cleanup_fenced_at is not null
    from public.dm_media_claims claim
    where claim.message_id = (
      select id from account_erasure_messages where name = 'claimed'
    )
  ),
  'account erasure fences an exclusive message claim'
);
select is(
  (
    select count(*)
    from public.dm_media_path_generations generation
    where generation.claimed_message_id = (
      select id from account_erasure_messages where name = 'claimed'
    )
      and generation.cleanup_fenced_at is not null
  ),
  1::bigint,
  'account erasure fences the claimed Storage generation'
);
select is(
  (
    select main_path
    from public.dm_media_account_erasure_dispositions
    where message_id = '74000000-0000-4000-8000-000000000003'
  ),
  '70000000-0000-4000-8000-000000000001/legacy-file.jpg',
  'a noncanonical signed URL still yields an exact preservation path'
);
select is(
  (
    select storage_objects
    from public.account_deletion_jobs
    where user_id = '70000000-0000-4000-8000-000000000001'
  ),
  '[{"bucket":"media","path":"70000000-0000-4000-8000-000000000001/1722501300001-111e8400-e29b-41d4-a716-446655440000.jpg"}]'::jsonb,
  'cleanup snapshot includes claimed media but excludes shared and unclaimed paths'
);
select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'media'
      and object.name in (
        '70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg',
        '70000000-0000-4000-8000-000000000001/legacy-file.jpg'
      )
  ),
  2::bigint,
  'shared and unclaimed Storage generations remain intact for remediation'
);
select is(
  (
    select count(*)
    from public.outbox_events event
    where event.event_type = 'account.cleanup'
      and event.aggregate_id = (
        select id::text from public.account_deletion_jobs
        where user_id = '70000000-0000-4000-8000-000000000001'
      )
  ),
  1::bigint,
  'account cleanup has one durable event'
);
select is(
  (
    select count(*)
    from public.outbox_events event
    where event.event_type = 'dm.media_cleanup'
      and event.aggregate_id in (
        select message.id::text
        from public.dm_messages message
        where message.sender_id = '70000000-0000-4000-8000-000000000001'
      )
  ),
  0::bigint,
  'account erasure never queues per-message cleanup for preserved media'
);
select ok(
  (select deleted_at is not null from public.profiles where id = '70000000-0000-4000-8000-000000000001'),
  'profile erasure commits in the same transaction as evidence and queueing'
);

create temporary table account_erasure_replay as
select public.queue_account_deletion(
  '70000000-0000-4000-8000-000000000001',
  null,
  '[
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/1722501300001-111e8400-e29b-41d4-a716-446655440000.jpg"},
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/1722501300002-222e8400-e29b-41d4-a716-446655440000.jpg"},
    {"bucket":"media","path":"70000000-0000-4000-8000-000000000001/legacy-file.jpg"}
  ]'::jsonb
) as result;
select is(
  (select result ->> 'job_id' from account_erasure_replay),
  (select result ->> 'job_id' from account_erasure_result),
  'lost-response retry returns the same deletion job'
);
select is(
  (
    select count(*)
    from public.outbox_events event
    where event.event_type = 'account.cleanup'
      and event.aggregate_id = (select result ->> 'job_id' from account_erasure_result)
  ),
  1::bigint,
  'retry creates no duplicate account cleanup event'
);
select is(
  (
    select count(*)
    from public.dm_media_account_erasure_dispositions disposition
    where disposition.actor_id = '70000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'retry creates no duplicate erasure evidence'
);

create function pg_temp.reject_account_deletion_job()
returns trigger
language plpgsql
as $$
begin
  if new.user_id = '70000000-0000-4000-8000-000000000003' then
    raise exception 'forced account deletion job failure';
  end if;
  return new;
end;
$$;
create trigger reject_account_deletion_job
before insert or update on public.account_deletion_jobs
for each row execute function pg_temp.reject_account_deletion_job();

select throws_ok(
  $$
    select public.queue_account_deletion(
      '70000000-0000-4000-8000-000000000003',
      null,
      '[{"bucket":"media","path":"70000000-0000-4000-8000-000000000003/1722501300005-555e8400-e29b-41d4-a716-446655440000.jpg"}]'::jsonb
    )
  $$,
  'P0001',
  'forced account deletion job failure',
  'a post-erasure queue failure aborts the account workflow statement'
);
select ok(
  (select deleted_at is null from public.profiles
   where id = '70000000-0000-4000-8000-000000000003')
  and (
    select not is_deleted and media_url is not null
    from public.dm_messages
    where id = (select id from account_erasure_messages where name = 'rollback')
  )
  and (
    select cleanup_fenced_at is null
    from public.dm_media_claims
    where message_id = (select id from account_erasure_messages where name = 'rollback')
  )
  and not exists (
    select 1 from public.dm_media_account_erasure_dispositions
    where actor_id = '70000000-0000-4000-8000-000000000003'
  )
  and not exists (
    select 1 from public.account_deletion_jobs
    where user_id = '70000000-0000-4000-8000-000000000003'
  ),
  'the failed statement rolls back tombstone, fences, evidence, profile, and job'
);

drop trigger reject_account_deletion_job on public.account_deletion_jobs;
drop function pg_temp.reject_account_deletion_job();

create temporary table account_erasure_rollback_retry as
select public.queue_account_deletion(
  '70000000-0000-4000-8000-000000000003',
  null,
  '[{"bucket":"media","path":"70000000-0000-4000-8000-000000000003/1722501300005-555e8400-e29b-41d4-a716-446655440000.jpg"}]'::jsonb
) as result;
select is(
  (select result ->> 'success' from account_erasure_rollback_retry),
  'true',
  'the same account deletion can retry after a transactional rollback'
);
select ok(
  (select deleted_at is not null from public.profiles
   where id = '70000000-0000-4000-8000-000000000003')
  and (
    select is_deleted and media_url is null
    from public.dm_messages
    where id = (select id from account_erasure_messages where name = 'rollback')
  )
  and exists (
    select 1 from public.dm_media_account_erasure_dispositions
    where actor_id = '70000000-0000-4000-8000-000000000003'
      and disposition = 'claimed_account_cleanup'
  )
  and exists (
    select 1 from public.account_deletion_jobs
    where user_id = '70000000-0000-4000-8000-000000000003'
  ),
  'the retried statement commits tombstone, evidence, and cleanup workflow together'
);

insert into account_erasure_messages (name, id)
select
  'normal-delete',
  (public.send_message_transactional(
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000006',
    'Normal claimed delete',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000002/1722501300003-333e8400-e29b-41d4-a716-446655440000.jpg',
    null
  ) #>> '{message,id}')::uuid;
select is(
  (
    public.mutate_dm_message_idempotent(
      '70000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000002',
      (select id from account_erasure_messages where name = 'normal-delete'),
      'delete',
      null,
      'dm_message:delete',
      'normal-delete-account-erasure-test',
      repeat('e', 64),
      'normal-delete-account-erasure-request'
    ) ->> 'response_status'
  ),
  '200',
  'ordinary claimed deletion remains available'
);
select is(
  (
    select count(*)
    from public.outbox_events event
    where event.event_type = 'dm.media_cleanup'
      and event.aggregate_id = (
        select id::text from account_erasure_messages where name = 'normal-delete'
      )
  ),
  1::bigint,
  'ordinary claimed deletion still queues exact media cleanup'
);

insert into public.dm_messages (
  id, thread_id, sender_id, client_id, sequence, content, message_type, media_url
)
values (
  '74000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000007',
  900005,
  'Ordinary unclaimed delete',
  'image',
  'https://project.supabase.co/storage/v1/object/public/media/70000000-0000-4000-8000-000000000002/1722501300004-444e8400-e29b-41d4-a716-446655440000.jpg'
);
select throws_ok(
  $$
    update public.dm_messages
    set is_deleted = true,
        content = null,
        media_url = null
    where id = '74000000-0000-4000-8000-000000000005'
  $$,
  'P0001',
  'DM media claim is unavailable',
  'ordinary unclaimed deletion cannot use the account-erasure exception'
);
select throws_ok(
  $$
    update public.dm_media_account_erasure_dispositions
    set evidence = '{"tampered":true}'::jsonb
    where message_id = '74000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'DM media account-erasure disposition is immutable',
  'erasure evidence cannot be changed after commit'
);
select is(
  public.queue_account_deletion(
    '79999999-9999-4999-8999-999999999999',
    null,
    '[]'::jsonb
  ) ->> 'error',
  'PROFILE_NOT_FOUND',
  'a nonexistent account cannot create a deletion workflow'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.erase_account_data(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.queue_account_deletion(uuid,text,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.erase_account_data(uuid)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.queue_account_deletion(uuid,text,jsonb)',
    'EXECUTE'
  ),
  'only the trusted service can invoke account erasure workflows'
);

select * from finish();
rollback;
