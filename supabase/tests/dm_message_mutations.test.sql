begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, email)
values
  ('60000000-0000-4000-8000-000000000001', 'dm-mutation-a@test.invalid'),
  ('60000000-0000-4000-8000-000000000002', 'dm-mutation-b@test.invalid'),
  ('60000000-0000-4000-8000-000000000003', 'dm-mutation-outsider@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'dm_mutation_a'),
  ('60000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'dm_mutation_b'),
  ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'dm_mutation_outsider');

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values (
  '61000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002'
);

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values
  (
    '63000000-0000-4000-8000-000000000001',
    'media',
    '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
    'main-v1',
    '{"eTag":"main-etag","size":100}'::jsonb,
    '{}'::jsonb
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    'media',
    '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp',
    'thumb-v1',
    '{"eTag":"thumb-etag","size":20}'::jsonb,
    '{}'::jsonb
  ),
  (
    '63000000-0000-4000-8000-000000000003',
    'media',
    '60000000-0000-4000-8000-000000000001/1722501296790-660e8400-e29b-41d4-a716-446655440000.jpg',
    'foreign-v1',
    '{"eTag":"foreign-etag","size":120}'::jsonb,
    '{}'::jsonb
  );

create temporary table dm_mutation_messages (
  name text primary key,
  id uuid not null
);

insert into dm_mutation_messages (name, id)
select
  'edit',
  (public.send_message_transactional(
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'before edit'
  ) #>> '{message,id}')::uuid;

insert into dm_mutation_messages (name, id)
select
  'foreign',
  (public.send_message_transactional(
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000003',
    'Another photo',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296790-660e8400-e29b-41d4-a716-446655440000.jpg',
    null
  ) #>> '{message,id}')::uuid;

insert into dm_mutation_messages (name, id)
select
  'delete',
  (public.send_message_transactional(
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000002',
    'Photo',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
    'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
  ) #>> '{message,id}')::uuid;

select is(
  (
    select count(*)
    from public.dm_media_path_generations generation
    where generation.claimed_message_id = (
      select id from dm_mutation_messages where name = 'delete'
    )
      and generation.claim_role in ('main', 'thumbnail')
  ),
  2::bigint,
  'an image send atomically binds both immutable generations to one message'
);
select is(
  (
    public.send_message_transactional(
      '61000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000002',
      'Photo',
      'image',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
    ) #>> '{message,id}'
  ),
  (select id::text from dm_mutation_messages where name = 'delete'),
  'the same client key replays the exact claimed message'
);
select is(
  (
    public.send_message_transactional(
      '61000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000002',
      'Photo',
      'image',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
    ) ->> 'deduplicated'
  ),
  'true',
  'the exact replay is explicitly marked deduplicated'
);
select is(
  (
    public.send_message_transactional(
      '61000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000004',
      'Competing photo',
      'image',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
    ) ->> 'error'
  ),
  'MEDIA_ALREADY_CLAIMED',
  'the ordered generation lock serializes a competing A/B claim race to one winner'
);
select ok(
  not exists (
    select 1
    from public.dm_messages message
    where message.thread_id = '61000000-0000-4000-8000-000000000001'
      and message.client_id = '62000000-0000-4000-8000-000000000004'
  ) and not exists (
    select 1
    from public.dm_media_claims claim
    where claim.client_id = '62000000-0000-4000-8000-000000000004'
  ),
  'a losing or failed send leaves neither a message nor an orphan claim'
);

create temporary table dm_mutation_results (
  name text primary key,
  result jsonb not null
);

insert into dm_mutation_results (name, result)
select 'edit-first', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'edit',
  'after edit',
  'dm_message:edit',
  'dm-edit-key-00000001',
  repeat('a', 64),
  'dm-edit-request-1'
) from dm_mutation_messages where name = 'edit';

select is((select result ->> 'response_status' from dm_mutation_results where name = 'edit-first'), '200', 'first edit succeeds');
select is((select result #>> '{response_body,message,content}' from dm_mutation_results where name = 'edit-first'), 'after edit', 'edit returns normalized durable content');
select is((select result #>> '{response_body,message,is_edited}' from dm_mutation_results where name = 'edit-first'), 'true', 'edit response is marked edited');
select is((select content from public.dm_messages where id = (select id from dm_mutation_messages where name = 'edit')), 'after edit', 'edit commits the row');
select is(
  (select count(*) from public.outbox_events where event_type = 'message.changed' and payload ->> 'message_id' = (select id::text from dm_mutation_messages where name = 'edit') and payload ->> 'action' = 'edited'),
  1::bigint,
  'edit emits one canonical message.changed event'
);

insert into dm_mutation_results (name, result)
select 'edit-replay', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'edit',
  'after edit',
  'dm_message:edit',
  'dm-edit-key-00000001',
  repeat('a', 64),
  'dm-edit-request-lost-response'
) from dm_mutation_messages where name = 'edit';

select is((select result ->> 'replayed' from dm_mutation_results where name = 'edit-replay'), 'true', 'lost edit response replays');
select is(
  (select result -> 'response_body' from dm_mutation_results where name = 'edit-replay'),
  (select result -> 'response_body' from dm_mutation_results where name = 'edit-first'),
  'edit replay returns the exact stored body'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'message.changed' and payload ->> 'message_id' = (select id::text from dm_mutation_messages where name = 'edit') and payload ->> 'action' = 'edited'),
  1::bigint,
  'edit replay emits no duplicate event'
);

insert into dm_mutation_results (name, result)
select 'edit-conflict', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'edit',
  'conflicting edit',
  'dm_message:edit',
  'dm-edit-key-00000001',
  repeat('b', 64),
  'dm-edit-request-conflict'
) from dm_mutation_messages where name = 'edit';

select is((select result ->> 'response_status' from dm_mutation_results where name = 'edit-conflict'), '409', 'same edit key with another payload conflicts');
select is((select result #>> '{response_body,code}' from dm_mutation_results where name = 'edit-conflict'), 'IDEMPOTENCY_KEY_REUSED', 'edit conflict has canonical code');
select is((select content from public.dm_messages where id = (select id from dm_mutation_messages where name = 'edit')), 'after edit', 'conflict cannot change the row');

insert into dm_mutation_results (name, result)
select 'delete-first', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'delete',
  null,
  'dm_message:delete',
  'dm-delete-key-000001',
  repeat('c', 64),
  'dm-delete-request-1'
) from dm_mutation_messages where name = 'delete';

select is((select result ->> 'response_status' from dm_mutation_results where name = 'delete-first'), '200', 'first delete succeeds');
select is((select result #>> '{response_body,message,is_deleted}' from dm_mutation_results where name = 'delete-first'), 'true', 'delete returns the tombstone');
select ok(
  (select content is null and media_url is null and media_thumbnail_url is null from public.dm_messages where id = (select id from dm_mutation_messages where name = 'delete')),
  'delete clears private content and media references atomically'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'message.changed' and payload ->> 'message_id' = (select id::text from dm_mutation_messages where name = 'delete') and payload ->> 'action' = 'deleted'),
  1::bigint,
  'delete emits one canonical message.changed event'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'dm.media_cleanup' and aggregate_id = (select id::text from dm_mutation_messages where name = 'delete')),
  1::bigint,
  'delete durably enqueues one media cleanup'
);
select is(
  (select payload ->> 'main_path' from public.outbox_events where event_type = 'dm.media_cleanup' and aggregate_id = (select id::text from dm_mutation_messages where name = 'delete')),
  '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
  'cleanup retains the exact canonical main object path'
);
select is(
  (select count(*) from public.dm_media_cleanup_snapshots where message_id = (select id from dm_mutation_messages where name = 'delete')),
  1::bigint,
  'delete persists one immutable cleanup snapshot'
);
select ok(
  (
    select claim.cleanup_fenced_at is not null
    from public.dm_media_claims claim
    where claim.message_id = (select id from dm_mutation_messages where name = 'delete')
  ),
  'delete transaction permanently fences the exact message pair claim'
);
select is(
  (
    select count(*)
    from public.dm_media_path_generations generation
    where generation.claimed_message_id = (
      select id from dm_mutation_messages where name = 'delete'
    )
      and generation.cleanup_fenced_at is not null
  ),
  2::bigint,
  'delete transaction fences both claimed generations before cleanup authorization'
);
select is(
  (
    select event.payload
    from public.dm_media_cleanup_snapshots snapshot
    join public.outbox_events event on event.id = snapshot.outbox_event_id
    where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete')
  ),
  (
    select jsonb_build_object(
      'cleanup_id', snapshot.cleanup_id,
      'message_id', snapshot.message_id,
      'thread_id', snapshot.thread_id,
      'actor_id', snapshot.actor_id,
      'sequence', snapshot.sequence,
      'main_path', snapshot.main_path,
      'main_object_digest', snapshot.main_object_digest,
      'thumbnail_path', snapshot.thumbnail_path,
      'thumbnail_object_digest', snapshot.thumbnail_object_digest
    )
    from public.dm_media_cleanup_snapshots snapshot
    where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete')
  ),
  'cleanup event is the exact persisted positional snapshot'
);

insert into dm_mutation_results (name, result)
select 'delete-replay', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'delete',
  null,
  'dm_message:delete',
  'dm-delete-key-000001',
  repeat('c', 64),
  'dm-delete-request-lost-response'
) from dm_mutation_messages where name = 'delete';

select is((select result ->> 'replayed' from dm_mutation_results where name = 'delete-replay'), 'true', 'lost delete response replays');
select is(
  (select result -> 'response_body' from dm_mutation_results where name = 'delete-replay'),
  (select result -> 'response_body' from dm_mutation_results where name = 'delete-first'),
  'delete replay returns the exact stored body'
);
select is(
  (select count(*) from public.outbox_events where event_type in ('message.changed', 'dm.media_cleanup') and payload ->> 'message_id' = (select id::text from dm_mutation_messages where name = 'delete') and (payload ->> 'action' = 'deleted' or event_type = 'dm.media_cleanup')),
  2::bigint,
  'delete replay duplicates neither convergence nor cleanup work'
);

insert into dm_mutation_results (name, result)
select 'delete-new-key', public.mutate_dm_message_idempotent(
  '60000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  id,
  'delete',
  null,
  'dm_message:delete',
  'dm-delete-key-000002',
  repeat('d', 64),
  'dm-delete-request-new-key'
) from dm_mutation_messages where name = 'delete';

select is((select result ->> 'response_status' from dm_mutation_results where name = 'delete-new-key'), '200', 'DELETE stays idempotent across a new key');
select is(
  (select count(*) from public.outbox_events where event_type = 'dm.media_cleanup' and aggregate_id = (select id::text from dm_mutation_messages where name = 'delete')),
  1::bigint,
  'a new delete key cannot duplicate cleanup'
);

update public.outbox_events event
set status = 'processing',
    locked_by = 'pgtap-dm-cleanup',
    locked_at = now()
where event.event_type = 'dm.media_cleanup'
  and event.aggregate_id = (select id::text from dm_mutation_messages where name = 'delete');

select ok(
  public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    snapshot.main_path,
    snapshot.main_object_digest,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest
  ),
  'worker cleanup is authorized only for the exact deleted object snapshot'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');
select is(
  (
    public.send_message_transactional(
      '61000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000005',
      'Late competing photo',
      'image',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
    ) ->> 'error'
  ),
  'MEDIA_ALREADY_CLAIMED',
  'a new B claim remains blocked after cleanup authorization and before remove'
);
select ok(
  not public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    999,
    snapshot.main_path,
    snapshot.main_object_digest,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest
  ),
  'worker cleanup rejects a stale message generation'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');
select ok(
  not public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    '60000000-0000-4000-8000-000000000001/1722501296790-660e8400-e29b-41d4-a716-446655440000.jpg',
    snapshot.main_object_digest,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest
  ),
  'worker cleanup rejects another live message path owned by the same actor'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');
select ok(
  not public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    snapshot.main_path,
    snapshot.main_object_digest,
    null,
    null
  ),
  'worker cleanup rejects a missing thumbnail path'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');
select ok(
  not public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest,
    snapshot.main_path,
    snapshot.main_object_digest
  ),
  'worker cleanup rejects swapped main and thumbnail paths'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');

select throws_ok(
  $$
    update storage.objects
    set version = 'main-replaced-v2',
        metadata = '{"eTag":"replacement-etag","size":101}'::jsonb
    where bucket_id = 'media'
      and name = '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg'
  $$,
  'P0001',
  'DM media path is immutable and cannot be replaced',
  'a replacement cannot enter between authorization and remove-by-path'
);
select ok(
  public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    snapshot.main_path,
    snapshot.main_object_digest,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest
  ),
  'failed replacement leaves the exact cleanup generation authorized'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');

select pg_catalog.set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$
    delete from storage.objects
    where bucket_id = 'media'
      and name in (
        '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
        '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
      )
  $$,
  'the Storage API delete path remains allowed by the immutable fence'
);
select ok(
  public.authorize_dm_media_cleanup(
    snapshot.outbox_event_id,
    snapshot.cleanup_id,
    snapshot.message_id,
    snapshot.thread_id,
    snapshot.actor_id,
    snapshot.sequence,
    snapshot.main_path,
    snapshot.main_object_digest,
    snapshot.thumbnail_path,
    snapshot.thumbnail_object_digest
  ),
  'a crash after Storage deletion can safely retry the idempotent remove'
) from public.dm_media_cleanup_snapshots snapshot
where snapshot.message_id = (select id from dm_mutation_messages where name = 'delete');
select is(
  (
    select count(*)
    from public.dm_media_path_generations generation
    where generation.path in (
      '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000_thumb.webp'
    )
  ),
  2::bigint,
  'deletion and crashes never release the permanent path generations'
);
select throws_ok(
  $$
    insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
    values (
      '63000000-0000-4000-8000-000000000004',
      'media',
      '60000000-0000-4000-8000-000000000001/1722501296789-550e8400-e29b-41d4-a716-446655440000.jpg',
      'reused-v2',
      '{"eTag":"reused-etag","size":101}'::jsonb,
      '{}'::jsonb
    )
  $$,
  'P0001',
  'DM media path is immutable and cannot be reused',
  'a deleted path cannot be reused by a replacement generation'
);
select lives_ok(
  $$
    insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
    values (
      '63000000-0000-4000-8000-000000000005',
      'media',
      '60000000-0000-4000-8000-000000000001/1722501296791-770e8400-e29b-41d4-a716-446655440000.jpg',
      'fresh-v1',
      '{"eTag":"fresh-etag","size":88}'::jsonb,
      '{}'::jsonb
    )
  $$,
  'a legitimate upload at a fresh server-generated path is allowed'
);
select is(
  (
    select object_id
    from public.dm_media_path_generations
    where bucket_id = 'media'
      and path = '60000000-0000-4000-8000-000000000001/1722501296791-770e8400-e29b-41d4-a716-446655440000.jpg'
  ),
  '63000000-0000-4000-8000-000000000005'::uuid,
  'a fresh upload atomically registers its immutable generation'
);

insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values (
  '63000000-0000-4000-8000-000000000008',
  'media',
  '60000000-0000-4000-8000-000000000001/1722501296792-880e8400-e29b-41d4-a716-446655440000.jpg',
  'legacy-shared-v1',
  '{"eTag":"legacy-shared-etag","size":90}'::jsonb,
  '{}'::jsonb
);
insert into public.dm_messages (
  id, thread_id, sender_id, client_id, sequence, content, message_type, media_url
)
values
  (
    '64000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000001',
    900001,
    'Legacy shared A',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296792-880e8400-e29b-41d4-a716-446655440000.jpg'
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000002',
    900002,
    'Legacy shared B',
    'image',
    'https://project.supabase.co/storage/v1/object/public/media/60000000-0000-4000-8000-000000000001/1722501296792-880e8400-e29b-41d4-a716-446655440000.jpg'
  );
insert into public.dm_media_claim_backfill_conflicts (
  message_id,
  thread_id,
  actor_id,
  client_id,
  main_path,
  reason,
  related_message_ids,
  evidence
)
select
  message.id,
  message.thread_id,
  message.sender_id,
  message.client_id,
  '60000000-0000-4000-8000-000000000001/1722501296792-880e8400-e29b-41d4-a716-446655440000.jpg',
  'duplicate_path',
  array[
    '64000000-0000-4000-8000-000000000001'::uuid,
    '64000000-0000-4000-8000-000000000002'::uuid
  ],
  pg_catalog.jsonb_build_object('fixture', 'legacy duplicate')
from public.dm_messages message
where message.id in (
  '64000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000002'
);
select is(
  (
    select count(*)
    from public.dm_media_claim_backfill_conflicts conflict
    where conflict.reason = 'duplicate_path'
      and conflict.message_id in (
        '64000000-0000-4000-8000-000000000001',
        '64000000-0000-4000-8000-000000000002'
      )
  ),
  2::bigint,
  'legacy duplicate references retain per-message remediation evidence'
);
select throws_ok(
  $$
    update public.dm_messages
    set is_deleted = true,
        content = null,
        media_url = null
    where id = '64000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'DM media claim is unavailable',
  'a legacy duplicate without an exclusive claim fails delete closed'
);
select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'media'
      and object.name = '60000000-0000-4000-8000-000000000001/1722501296792-880e8400-e29b-41d4-a716-446655440000.jpg'
  ),
  1::bigint,
  'failed legacy duplicate deletion leaves the shared Storage generation intact'
);

insert into storage.buckets (id, name, public)
values ('unrelated-test-media', 'unrelated-test-media', false)
on conflict (id) do nothing;
insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values (
  '63000000-0000-4000-8000-000000000006',
  'unrelated-test-media',
  'object.jpg',
  'other-v1',
  '{"eTag":"other-etag","size":10}'::jsonb,
  '{}'::jsonb
);
select lives_ok(
  $$
    update storage.objects
    set version = 'other-v2',
        metadata = '{"eTag":"other-etag-v2","size":11}'::jsonb
    where id = '63000000-0000-4000-8000-000000000006'
  $$,
  'the trigger does not alter normal writes outside the media bucket'
);
insert into storage.objects (id, bucket_id, name, version, metadata, user_metadata)
values (
  '63000000-0000-4000-8000-000000000007',
  'media',
  'legacy/noncanonical-object.jpg',
  'legacy-v1',
  '{"eTag":"legacy-etag","size":12}'::jsonb,
  '{}'::jsonb
);
select lives_ok(
  $$
    update storage.objects
    set version = 'legacy-v2',
        metadata = '{"eTag":"legacy-etag-v2","size":13}'::jsonb
    where id = '63000000-0000-4000-8000-000000000007'
  $$,
  'the trigger ignores noncanonical legacy paths inside the media bucket'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.mutate_dm_message_idempotent(uuid,uuid,uuid,text,text,text,text,text,text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.authorize_dm_media_cleanup(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text)', 'EXECUTE'),
  'clients cannot execute mutation or cleanup authorization RPCs'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.mutate_dm_message_idempotent(uuid,uuid,uuid,text,text,text,text,text,text)', 'EXECUTE')
  and pg_catalog.has_function_privilege('service_role', 'public.authorize_dm_media_cleanup(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text)', 'EXECUTE'),
  'service role owns both server-only RPCs'
);

select * from finish();
rollback;
