begin;

create extension if not exists pgtap with schema extensions;
select plan(91);

insert into auth.users (id, email)
values
  ('61000000-0000-4000-8000-000000000001', 'media-owner@test.invalid'),
  ('61000000-0000-4000-8000-000000000002', 'media-reviewer@test.invalid');

insert into public.profiles (id, auth_user_id, username)
values
  ('61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'media_owner'),
  ('61000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'media_reviewer');

insert into public.profile_photos (
  id, user_id, storage_path, storage_bucket, thumbnail_storage_path,
  url, thumbnail_url, is_avatar, is_cover, is_private, display_order, approval_status
)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/photo.jpg',
    'profile-media-quarantine',
    null,
    'https://storage.invalid/storage/v1/object/public/profile-media-quarantine/61000000-0000-4000-8000-000000000001/photo.jpg',
    null, false, false, false, 0, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/reject.jpg',
    'profile-media-quarantine',
    null,
    'https://storage.invalid/storage/v1/object/public/profile-media-quarantine/61000000-0000-4000-8000-000000000001/reject.jpg',
    null, false, false, false, 1, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/cover.jpg',
    'profile-media-quarantine',
    null,
    'https://storage.invalid/storage/v1/object/public/profile-media-quarantine/61000000-0000-4000-8000-000000000001/cover.jpg',
    null, false, true, false, 2, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/deleted-event.jpg',
    'profile-media-quarantine', null,
    'https://storage.invalid/deleted-event.jpg', null,
    false, false, false, 3, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000005',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/worker-repair.jpg',
    'profile-media-quarantine', null,
    'https://storage.invalid/worker-repair.jpg', null,
    false, false, false, 4, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000006',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/conflict.jpg',
    'profile-media-quarantine', null,
    'https://storage.invalid/conflict.jpg', null,
    false, false, false, 5, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000007',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/null-lease.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/null-lease.jpg', null,
    false, false, false, 6, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000008',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/partial-lease.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/partial-lease.jpg', null,
    false, false, false, 7, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000009',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/future-lease.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/future-lease.jpg', null,
    false, false, false, 8, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/expired-lease.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/expired-lease.jpg', null,
    false, false, false, 9, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/pending-stale-lease.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/pending-stale-lease.jpg', null,
    false, false, false, 10, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000012',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/no-snapshot.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/no-snapshot.jpg', null,
    false, false, false, 11, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000013',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/alert-failure.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/alert-failure.jpg', null,
    false, false, false, 12, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000014',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/digest-mismatch.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/digest-mismatch.jpg', null,
    false, false, false, 13, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000015',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/invalid-pair.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/invalid-pair.jpg', null,
    false, false, false, 14, 'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000016',
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001/reject-reconstruct.jpg',
    'profile-media-quarantine', null, 'https://storage.invalid/reject-reconstruct.jpg', null,
    false, false, false, 15, 'pending'
  );

select is((select public from storage.buckets where id = 'profile-media-quarantine'), false, 'quarantine bucket denies public object reads');
select is((select public from storage.buckets where id = 'profile-photos'), false, 'legacy mixed bucket is no longer public');
select is((select public from storage.buckets where id = 'approved-profile-photos'), true, 'the serving bucket is public but publication is database-authorized first');
select ok(not has_function_privilege('anon', 'public.request_profile_media_moderation(uuid,uuid,text,text)', 'EXECUTE'), 'anon cannot queue moderation');
select ok(not has_function_privilege('authenticated', 'public.request_profile_media_moderation(uuid,uuid,text,text)', 'EXECUTE'), 'authenticated clients cannot queue moderation');
select ok(not has_function_privilege('anon', 'public.finalize_profile_media_moderation(uuid,uuid,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot publish Storage references');
select ok(not has_function_privilege('anon', 'public.complete_profile_media_publication(uuid,uuid)', 'EXECUTE'), 'anon cannot complete public promotion');
select ok(not has_function_privilege('anon', 'public.resolve_profile_media_remediation(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'anon cannot resolve media remediation');
select ok(not has_function_privilege('authenticated', 'public.resolve_profile_media_remediation(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'authenticated clients cannot resolve media remediation');
select ok(has_function_privilege('service_role', 'public.resolve_profile_media_remediation(uuid,uuid,uuid,text,text)', 'EXECUTE'), 'only the trusted service path can invoke operator remediation');

create temporary table profile_media_results (name text primary key, result jsonb not null);

insert into profile_media_results values (
  'approve',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'approve',
    null
  )
);

select is((select result ->> 'moderation_action' from profile_media_results where name = 'approve'), 'approve', 'approval is queued');
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'approve'), 'pending', 'the moderation route receives proof of claimable work');
select is((select approval_status::text from public.profile_photos where id = '62000000-0000-4000-8000-000000000001'), 'pending', 'queued approval remains invisible');
select is((select count(*) from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 1::bigint, 'approval creates one durable Storage operation');
select ok((
  select photo.moderation_event_payload = event.payload
  from public.profile_photos photo
  join public.outbox_events event
    on event.event_type = 'profile.media_moderation'
   and event.aggregate_id = photo.moderation_operation_id::text
  where photo.id = '62000000-0000-4000-8000-000000000001'
), 'the active row retains the immutable event reconstruction payload');
select ok((
  select moderation_event_payload_digest = encode(
    extensions.digest(moderation_event_payload::text, 'sha256'),
    'hex'
  )
  from public.profile_photos
  where id = '62000000-0000-4000-8000-000000000001'
), 'the immutable snapshot records an exact pre-corruption digest');
select throws_ok(
  $$update public.profile_photos
    set moderation_event_payload = jsonb_set(
          moderation_event_payload,
          '{source_path}',
          '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
        ),
        moderation_event_payload_digest = encode(extensions.digest(jsonb_set(
          moderation_event_payload,
          '{source_path}',
          '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
        )::text, 'sha256'), 'hex')
    where id = '62000000-0000-4000-8000-000000000001'$$,
  '23514',
  'Cannot mutate an active profile media operation snapshot',
  'even a matching forged payload and digest cannot replace an active immutable snapshot'
);

select throws_ok(
  $$delete from public.outbox_events
    where event_type = 'profile.media_moderation'
      and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'$$,
  '23503',
  'Cannot delete the event for an active profile media operation',
  'an event-delete race cannot remove active moderation work'
);

select throws_ok(
  $$insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    select 'profile.media_moderation', 'profile_photo', gen_random_uuid(), moderation_event_payload
    from public.profile_photos
    where id = '62000000-0000-4000-8000-000000000001'$$,
  '23505', null,
  'the live-photo key rejects multiple active events for one photo'
);

alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
update public.outbox_events
set status = 'dead',
    attempts = 100,
    available_at = timezone('utc', now()) + interval '1 day',
    locked_at = timezone('utc', now()),
    locked_by = 'expired-worker',
    last_error = 'legacy terminal retry'
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001';
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;

insert into profile_media_results values (
  'approve_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'approve',
    null
  )
);

select is((select result ->> 'moderation_operation_id' from profile_media_results where name = 'approve_replay'), (select result ->> 'moderation_operation_id' from profile_media_results where name = 'approve'), 'approval replay keeps the same operation id');
select is((select count(*) from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 1::bigint, 'approval replay does not duplicate the outbox');
select is((select status from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 'pending', 'same-decision replay revives the exact dead event');
select is((select attempts from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 100, 'event revival preserves the retry audit');

insert into profile_media_results values (
  'deleted_event_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000002',
    'approve', null
  )
);
alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
delete from public.outbox_events
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000004';
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;
insert into profile_media_results values (
  'deleted_event_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000004',
    '61000000-0000-4000-8000-000000000002',
    'approve', null
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'deleted_event_replay'), 'pending', 'same-decision replay recreates a deleted exact event');
select is((
  select count(*)
  from public.outbox_events event
  join public.profile_photos photo
    on event.aggregate_id = photo.moderation_operation_id::text
  where photo.id = '62000000-0000-4000-8000-000000000004'
    and event.event_type = 'profile.media_moderation'
    and event.status = 'pending'
), 1::bigint, 'deleted-event replay restores exactly one claimable operation row');
select ok((
  select event.payload = photo.moderation_event_payload
  from public.profile_photos photo
  join public.outbox_events event
    on event.aggregate_id = photo.moderation_operation_id::text
   and event.event_type = 'profile.media_moderation'
  where photo.id = '62000000-0000-4000-8000-000000000004'
), 'recreated work preserves the original operation id and immutable payload');

insert into profile_media_results values (
  'worker_repair_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000005',
    '61000000-0000-4000-8000-000000000002',
    'reject', 'repair test'
  )
);
alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
delete from public.outbox_events
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000005';
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;

create temporary table profile_media_claimed as
select * from public.claim_outbox_events(100, 'profile-media-replay-worker');

select is((select count(*) from profile_media_claimed where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 1::bigint, 'revived event is immediately claim eligible');
select is((select count(*) from profile_media_claimed where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000005'), 1::bigint, 'worker claim repairs and claims a missing legacy operation row');
select ok((
  select event.payload = photo.moderation_event_payload
  from public.profile_photos photo
  join public.outbox_events event
    on event.aggregate_id = photo.moderation_operation_id::text
  where photo.id = '62000000-0000-4000-8000-000000000005'
    and event.locked_by = 'profile-media-replay-worker'
), 'claim-path repair reconstructs only the exact active operation payload');

insert into profile_media_results values (
  'approve_concurrent_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'approve',
    null
  )
);
select is((select result ->> 'moderation_operation_id' from profile_media_results where name = 'approve_concurrent_replay'), (select result ->> 'moderation_operation_id' from profile_media_results where name = 'approve'), 'concurrent moderator replay retains the operation fence');
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'approve_concurrent_replay'), 'processing', 'route proof recognizes only the valid unexpired processing lease');
select ok((select status = 'processing' and locked_by = 'profile-media-replay-worker' from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'), 'moderator replay does not steal an active worker lease');
select throws_ok(
  $$update public.outbox_events
    set locked_by = 'forged-worker', locked_at = now()
    where event_type = 'profile.media_moderation'
      and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'manual lock-owner replacement cannot steal an unexpired worker lease'
);
select is(
  public.profile_media_operation_state(
    '62000000-0000-4000-8000-000000000001',
    (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'approve'),
    'approve'
  ),
  'pending',
  'worker can prove the pending operation'
);
select is(
  public.finalize_profile_media_moderation(
    '62000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    'approve',
    'approved-profile-photos',
    '61000000-0000-4000-8000-000000000001/forged.jpg',
    null,
    'https://storage.invalid/storage/v1/object/public/approved-profile-photos/61000000-0000-4000-8000-000000000001/forged.jpg',
    null
  ) ->> 'error',
  'STALE_MEDIA_OPERATION',
  'a forged finalizer cannot publish'
);

insert into profile_media_results values (
  'approved',
  public.finalize_profile_media_moderation(
    '62000000-0000-4000-8000-000000000001',
    (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'approve'),
    'approve',
    'approved-profile-photos',
    '61000000-0000-4000-8000-000000000001/approved.jpg',
    null,
    'https://storage.invalid/storage/v1/object/public/approved-profile-photos/61000000-0000-4000-8000-000000000001/approved.jpg',
    null
  )
);

select is((select result ->> 'approval_status' from profile_media_results where name = 'approved'), 'approved', 'finalizer authorizes publication before public Storage copy');
select is((select result ->> 'storage_bucket' from profile_media_results where name = 'approved'), 'approved-profile-photos', 'approved row authorizes the exact public serving destination');
select is(public.profile_media_operation_state('62000000-0000-4000-8000-000000000001', (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'approve'), 'approve'), 'publish', 'public copy is allowed only after authoritative approval');
insert into profile_media_results values (
  'published',
  public.complete_profile_media_publication(
    '62000000-0000-4000-8000-000000000001',
    (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'approve')
  )
);
select is((select result ->> 'moderation_action' from profile_media_results where name = 'published'), null, 'publication completion clears the operation fence');
select is((select moderation_event_payload from public.profile_photos where id = '62000000-0000-4000-8000-000000000001'), null::jsonb, 'publication completion clears the reconstruction payload');
select is((select moderation_event_payload_digest from public.profile_photos where id = '62000000-0000-4000-8000-000000000001'), null::text, 'publication completion clears the snapshot digest');
select is(public.profile_media_operation_state('62000000-0000-4000-8000-000000000001', (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'approve'), 'approve'), 'finalized', 'completed publication replay is recognized as finalized');

insert into profile_media_results values (
  'reject',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002',
    'reject',
    'Policy violation'
  )
);
select is((select approval_status::text from public.profile_photos where id = '62000000-0000-4000-8000-000000000002'), 'pending', 'rejection stays pending until Storage deletion succeeds');

insert into profile_media_results values (
  'rejected',
  public.finalize_profile_media_moderation(
    '62000000-0000-4000-8000-000000000002',
    (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'reject'),
    'reject', null, null, null, null, null
  )
);
select is((select result ->> 'approval_status' from profile_media_results where name = 'rejected'), 'rejected', 'rejection becomes visible only after deletion');
select ok((select not is_avatar and not is_cover from public.profile_photos where id = '62000000-0000-4000-8000-000000000002'), 'rejection clears every featured reference');
select is((select moderation_event_payload from public.profile_photos where id = '62000000-0000-4000-8000-000000000002'), null::jsonb, 'rejection convergence clears the reconstruction payload');
select is((select moderation_event_payload_digest from public.profile_photos where id = '62000000-0000-4000-8000-000000000002'), null::text, 'rejection convergence clears the snapshot digest');

insert into profile_media_results values (
  'cover_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000003',
    '61000000-0000-4000-8000-000000000002',
    'approve', null
  )
);
insert into profile_media_results values (
  'cover_approved',
  public.finalize_profile_media_moderation(
    '62000000-0000-4000-8000-000000000003',
    (select (result ->> 'moderation_operation_id')::uuid from profile_media_results where name = 'cover_request'),
    'approve',
    'approved-profile-photos',
    '61000000-0000-4000-8000-000000000001/cover-approved.jpg',
    null,
    'https://storage.invalid/storage/v1/object/public/approved-profile-photos/61000000-0000-4000-8000-000000000001/cover-approved.jpg',
    null
  )
);
select ok((select approval_status = 'approved' and is_cover from public.profile_photos where id = '62000000-0000-4000-8000-000000000003'), 'cover and gallery photos share the same promotion finalizer');
select is((select count(*) from public.profile_photos where approval_status <> 'approved' and storage_bucket = 'approved-profile-photos'), 0::bigint, 'no pending or rejected row references the public serving bucket');

insert into profile_media_results values (
  'conflict_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000006',
    '61000000-0000-4000-8000-000000000002',
    'approve', null
  )
);
alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
update public.outbox_events
set payload = jsonb_set(
  payload,
  '{source_path}',
  '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
)
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000006';
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;
select is(
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000006',
    '61000000-0000-4000-8000-000000000002',
    'approve', null
  ) ->> 'error',
  'MEDIA_EVENT_CONFLICT',
  'a same-owner forged other-photo path fails closed instead of becoming authoritative'
);

insert into profile_media_results values (
  'null_lease_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000007',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'partial_lease_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000008',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'future_lease_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000009',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'expired_lease_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000010',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'pending_stale_lease_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'no_snapshot_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000012',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);

select pg_catalog.set_config('peekpoke.outbox_worker_id', '', true);
select throws_ok(
  $$update public.outbox_events
    set status = 'processing', locked_at = now(), locked_by = 'manual-worker'
    where event_type = 'profile.media_moderation'
      and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000007'$$,
  '23514', null,
  'a direct service-role update cannot manufacture a processing lease'
);

-- Seed malformed pre-invariant rows to exercise replay and claim repair. Both
-- protections are restored immediately after the legacy fixtures are written.
alter table public.outbox_events
  drop constraint outbox_events_profile_media_lease_check;
alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
update public.outbox_events
set status = case
      when payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000011' then 'pending'
      else 'processing'
    end,
    attempts = case payload ->> 'photo_id'
      when '62000000-0000-4000-8000-000000000007' then 17
      when '62000000-0000-4000-8000-000000000008' then 18
      when '62000000-0000-4000-8000-000000000009' then 19
      when '62000000-0000-4000-8000-000000000010' then 21
      else 20
    end,
    locked_at = case payload ->> 'photo_id'
      when '62000000-0000-4000-8000-000000000007' then null
      when '62000000-0000-4000-8000-000000000009' then now() + interval '1 day'
      when '62000000-0000-4000-8000-000000000010' then now() - interval '10 minutes'
      else now()
    end,
    locked_by = case payload ->> 'photo_id'
      when '62000000-0000-4000-8000-000000000007' then null
      when '62000000-0000-4000-8000-000000000008' then null
      else 'legacy-worker'
    end,
    last_error = case payload ->> 'photo_id'
      when '62000000-0000-4000-8000-000000000007' then 'null lease audit'
      when '62000000-0000-4000-8000-000000000008' then 'partial lease audit'
      when '62000000-0000-4000-8000-000000000009' then 'future lease audit'
      when '62000000-0000-4000-8000-000000000010' then 'expired lease audit'
      else 'pending lease audit'
    end
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' in (
    '62000000-0000-4000-8000-000000000007',
    '62000000-0000-4000-8000-000000000008',
    '62000000-0000-4000-8000-000000000009',
    '62000000-0000-4000-8000-000000000010',
    '62000000-0000-4000-8000-000000000011'
  );
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;

insert into profile_media_results values (
  'null_lease_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000007',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'null_lease_replay'), 'pending', 'NULL processing lease is normalized before route acceptance');
select ok((select status = 'pending' and locked_at is null and locked_by is null and attempts = 17 and last_error = 'null lease audit' from public.outbox_events where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000007'), 'NULL lease repair preserves retry and error audit');

insert into profile_media_results values (
  'partial_lease_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000008',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'partial_lease_replay'), 'pending', 'partial processing lease is normalized before route acceptance');
select ok((select status = 'pending' and locked_at is null and locked_by is null and attempts = 18 and last_error = 'partial lease audit' from public.outbox_events where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000008'), 'partial lease repair preserves retry and error audit');

insert into profile_media_results values (
  'future_lease_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000009',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'future_lease_replay'), 'pending', 'future processing lease is impossible and is normalized to claimable work');
select ok((select status = 'pending' and available_at <= now() and attempts = 19 and last_error = 'future lease audit' from public.outbox_events where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000009'), 'future lease repair preserves audit while making work claimable');

insert into profile_media_results values (
  'pending_stale_lease_replay',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'pending_stale_lease_replay'), 'pending', 'pending work with a stale lease is normalized before route acceptance');
select ok((select status = 'pending' and locked_at is null and locked_by is null and attempts = 20 and last_error = 'pending lease audit' from public.outbox_events where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000011'), 'pending lease normalization preserves retry and error audit');

create temporary table profile_media_lease_claimed as
select * from public.claim_outbox_events(100, 'lease-repair-worker');
select is((select count(*) from profile_media_lease_claimed where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000010'), 1::bigint, 'claim repairs and immediately selects an expired processing lease');
select ok((select status = 'processing' and locked_by = 'lease-repair-worker' and attempts = 22 and last_error = 'expired lease audit' from public.outbox_events where payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000010'), 'expired lease reclaim preserves audit and records the new worker attempt');

alter table public.profile_photos
  drop constraint profile_photos_moderation_event_fence_check;
alter table public.profile_photos disable trigger guard_active_profile_media_snapshot_change;
update public.profile_photos
set moderation_event_payload = null
where id = '62000000-0000-4000-8000-000000000012';
alter table public.profile_photos enable trigger guard_active_profile_media_snapshot_change;
select is(
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000012',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  ) ->> 'error',
  'MEDIA_EVENT_CONFLICT',
  'processing work without its immutable photo snapshot fails closed'
);

insert into profile_media_results values (
  'digest_mismatch_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000014',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'invalid_pair_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000015',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
insert into profile_media_results values (
  'reject_reconstruct_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000016',
    '61000000-0000-4000-8000-000000000002', 'reject', 'policy test'
  )
);

alter table public.profile_photos disable trigger guard_active_profile_media_snapshot_change;
update public.profile_photos
set moderation_event_payload_digest = 'forged-digest'
where id = '62000000-0000-4000-8000-000000000014';
update public.profile_photos
set moderation_event_payload = jsonb_set(
      jsonb_set(
        moderation_event_payload,
        '{destination_bucket}',
        '"profile-media-quarantine"'::jsonb
      ),
      '{destination_path}',
      '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
    ),
    moderation_event_payload_digest = encode(extensions.digest(jsonb_set(
      jsonb_set(
        moderation_event_payload,
        '{destination_bucket}',
        '"profile-media-quarantine"'::jsonb
      ),
      '{destination_path}',
      '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
    )::text, 'sha256'), 'hex')
where id = '62000000-0000-4000-8000-000000000015';
alter table public.profile_photos enable trigger guard_active_profile_media_snapshot_change;

alter table public.outbox_events disable trigger guard_active_profile_media_event_change;
update public.outbox_events
set payload = jsonb_set(
  payload,
  '{source_path}',
  '"61000000-0000-4000-8000-000000000001/deleted-event.jpg"'::jsonb
)
where event_type = 'profile.media_moderation'
  and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000016';
alter table public.outbox_events enable trigger guard_active_profile_media_event_change;

insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
values
  ('message.changed', 'message', '65000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('account.cleanup', 'profile', '65000000-0000-4000-8000-000000000002', '{}'::jsonb),
  ('profile.updated', 'profile', '65000000-0000-4000-8000-000000000003', '{}'::jsonb);
create temporary table profile_media_fail_isolated_claimed as
select * from public.claim_outbox_events(100, 'fail-isolation-worker');
select is((select count(*) from profile_media_fail_isolated_claimed where aggregate_id in (
  '65000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000002',
  '65000000-0000-4000-8000-000000000003'
)), 3::bigint, 'corrupt media cannot starve unrelated chat, account, or profile claims');
select is((select count(*) from public.profile_media_remediation_alerts where status = 'open' and photo_id in (
  '62000000-0000-4000-8000-000000000006',
  '62000000-0000-4000-8000-000000000012',
  '62000000-0000-4000-8000-000000000014',
  '62000000-0000-4000-8000-000000000015',
  '62000000-0000-4000-8000-000000000016'
)), 5::bigint, 'multiple corrupt profile operations are independently quarantined and alerted');
select ok((select occurrence_count = 1 and char_length(error_detail) <= 500 and error_code = 'MEDIA_EVENT_CONFLICT' from public.profile_media_remediation_alerts where photo_id = '62000000-0000-4000-8000-000000000012'), 'remediation evidence is structured and bounded');
select ok((select moderation_action = 'approve' and approval_status = 'pending' and storage_bucket = 'profile-media-quarantine' from public.profile_photos where id = '62000000-0000-4000-8000-000000000012'), 'failed-safe quarantine preserves the decision and never exposes media');
select ok(not has_table_privilege('anon', 'public.profile_media_remediation_alerts', 'SELECT'), 'anon cannot read remediation evidence');
select ok(not has_table_privilege('authenticated', 'public.profile_media_remediation_alerts', 'SELECT'), 'authenticated clients cannot read remediation evidence');
select is(
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000012',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  ) ->> 'error',
  'MEDIA_REMEDIATION_REQUIRED',
  'moderator replay surfaces an actionable operator-remediation state'
);

insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
values ('message.changed', 'message', '65000000-0000-4000-8000-000000000004', '{}'::jsonb);
create temporary table profile_media_repeat_claimed as
select * from public.claim_outbox_events(100, 'repeat-scheduler-worker');
select is((select count(*) from profile_media_repeat_claimed where aggregate_id = '65000000-0000-4000-8000-000000000004'), 1::bigint, 'repeat schedulers continue claiming while open remediation stays isolated');
select is((select occurrence_count from public.profile_media_remediation_alerts where photo_id = '62000000-0000-4000-8000-000000000012'), 1, 'repeat schedulers do not spam an unchanged open alert');

insert into profile_media_results values (
  'missing_snapshot_reconstruct',
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000012',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000012'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'No immutable snapshot exists'
  )
);
select is((select result ->> 'error' from profile_media_results where name = 'missing_snapshot_reconstruct'), 'REMEDIATION_SNAPSHOT_MISSING', 'reconstruction rejects an operation with no independently preserved snapshot');

insert into profile_media_results values (
  'missing_snapshot_reset',
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000012',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000012'),
    '61000000-0000-4000-8000-000000000002',
    'reset',
    'No immutable snapshot exists; fresh moderator decision required'
  )
);
select is((select result ->> '_remediation_state' from profile_media_results where name = 'missing_snapshot_reset'), 'decision_reset', 'missing snapshots require an explicit audited decision reset');
select ok((select photo.moderation_action is null
    and photo.moderation_event_payload is null
    and photo.moderation_event_payload_digest is null
    and alert.resolution = 'decision_reset'
  from public.profile_photos photo
  join public.profile_media_remediation_alerts alert on alert.photo_id = photo.id
  where photo.id = '62000000-0000-4000-8000-000000000012'), 'audited reset clears every executable snapshot field');

insert into profile_media_results values (
  'operator_reconstructed',
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000006',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000006'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'Verified immutable snapshot and digest'
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'operator_reconstructed'), 'pending', 'operator reconstruction restores the snapshot-derived approve operation as claimable work');
select ok((
  select event.payload = photo.moderation_event_payload
    and photo.moderation_event_payload_digest = encode(
      extensions.digest(photo.moderation_event_payload::text, 'sha256'),
      'hex'
    )
    and event.payload ->> 'source_path' = '61000000-0000-4000-8000-000000000001/conflict.jpg'
  from public.profile_photos photo
  join public.outbox_events event
    on event.aggregate_id = photo.moderation_operation_id::text
   and event.event_type = 'profile.media_moderation'
  where photo.id = '62000000-0000-4000-8000-000000000006'
), 'fresh approve work is created only from the intact immutable photo snapshot');
select ok((select exists (
  select 1 from public.outbox_events event
  where event.event_type = 'profile.media_moderation.remediation'
    and event.payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000006'
    and event.payload ->> 'source_path' = '61000000-0000-4000-8000-000000000001/deleted-event.jpg'
    and event.status = 'dead'
)), 'the same-owner forged other-photo payload is preserved only as non-executable evidence');
select ok((select status = 'resolved' and resolution = 'reconstructed' from public.profile_media_remediation_alerts where photo_id = '62000000-0000-4000-8000-000000000006'), 'operator reconstruction resolves its durable alert audit');

insert into profile_media_results values (
  'operator_reconstructed_replay',
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000006',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000006'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'Retry after response loss'
  )
);
select ok((select result ->> '_remediation_replayed' = 'true' and result ->> '_moderation_queue_state' = 'pending' from profile_media_results where name = 'operator_reconstructed_replay'), 'response-loss retry returns the committed reconstruction result');
select is((select count(*) from public.outbox_events where event_type = 'profile.media_moderation' and payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000006'), 1::bigint, 'serialized remediation replay never duplicates executable work');
select is(
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000006',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000006'),
    '61000000-0000-4000-8000-000000000002',
    'reset',
    'Conflicting concurrent resolution'
  ) ->> 'error',
  'REMEDIATION_ALREADY_RESOLVED',
  'a concurrent conflicting resolution cannot replace the committed result'
);

select is(
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000014',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000014'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'Digest verification'
  ) ->> 'error',
  'REMEDIATION_SNAPSHOT_DIGEST_MISMATCH',
  'reconstruction rejects a snapshot whose captured digest no longer matches'
);
select is(
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000014',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000014'),
    '61000000-0000-4000-8000-000000000002',
    'reset',
    'Snapshot digest mismatch; fresh decision required'
  ) ->> '_remediation_state',
  'decision_reset',
  'digest mismatch can only be cleared through audited reset'
);

select is(
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000015',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000015'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'Bucket and path role verification'
  ) ->> 'error',
  'REMEDIATION_PAYLOAD_INVALID',
  'matching digest cannot authorize an approve snapshot with quarantine destination roles'
);
select is(
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000015',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000015'),
    '61000000-0000-4000-8000-000000000002',
    'reset',
    'Invalid bucket and path role pair; fresh decision required'
  ) ->> '_remediation_state',
  'decision_reset',
  'invalid bucket and path roles remain fail-closed until audited reset'
);

insert into profile_media_results values (
  'reject_reconstructed',
  public.resolve_profile_media_remediation(
    '62000000-0000-4000-8000-000000000016',
    (select moderation_operation_id from public.profile_photos where id = '62000000-0000-4000-8000-000000000016'),
    '61000000-0000-4000-8000-000000000002',
    'reconstruct',
    'Verified immutable reject snapshot and digest'
  )
);
select is((select result ->> '_moderation_queue_state' from profile_media_results where name = 'reject_reconstructed'), 'pending', 'operator reconstruction restores the snapshot-derived reject operation');
select ok((
  select event.payload = photo.moderation_event_payload
    and event.payload ->> 'action' = 'reject'
    and event.payload ->> 'source_path' = '61000000-0000-4000-8000-000000000001/reject-reconstruct.jpg'
    and event.payload -> 'destination_bucket' = 'null'::jsonb
    and event.payload -> 'destination_path' = 'null'::jsonb
  from public.profile_photos photo
  join public.outbox_events event
    on event.aggregate_id = photo.moderation_operation_id::text
   and event.event_type = 'profile.media_moderation'
  where photo.id = '62000000-0000-4000-8000-000000000016'
), 'fresh reject work deletes only the source recorded by the immutable snapshot');
select ok((select exists (
  select 1 from public.outbox_events event
  where event.event_type = 'profile.media_moderation.remediation'
    and event.payload ->> 'photo_id' = '62000000-0000-4000-8000-000000000016'
    and event.payload ->> 'source_path' = '61000000-0000-4000-8000-000000000001/deleted-event.jpg'
    and event.status = 'dead'
)), 'the forged reject payload is retained only as terminal evidence');

insert into profile_media_results values (
  'alert_failure_request',
  public.request_profile_media_moderation(
    '62000000-0000-4000-8000-000000000013',
    '61000000-0000-4000-8000-000000000002', 'approve', null
  )
);
alter table public.profile_photos disable trigger guard_active_profile_media_snapshot_change;
update public.profile_photos
set moderation_event_payload = null
where id = '62000000-0000-4000-8000-000000000013';
alter table public.profile_photos enable trigger guard_active_profile_media_snapshot_change;
create function pg_temp.fail_profile_media_alert()
returns trigger
language plpgsql
as $$begin raise exception 'simulated alert persistence failure'; end;$$;
create trigger fail_profile_media_alert_insert
before insert on public.profile_media_remediation_alerts
for each row execute function pg_temp.fail_profile_media_alert();
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
values ('profile.updated', 'profile', '65000000-0000-4000-8000-000000000005', '{}'::jsonb);
create temporary table profile_media_alert_failure_claimed as
select * from public.claim_outbox_events(100, 'alert-failure-worker');
select is((select count(*) from profile_media_alert_failure_claimed where aggregate_id = '65000000-0000-4000-8000-000000000005'), 1::bigint, 'alert persistence failure cannot abort unrelated claims');
select ok((select event.status = 'dead' and not exists (
    select 1 from public.profile_media_remediation_alerts alert where alert.photo_id = photo.id
  )
  from public.profile_photos photo
  join public.outbox_events event on event.aggregate_id = photo.moderation_operation_id::text
  where photo.id = '62000000-0000-4000-8000-000000000013'), 'alert failure still leaves the corrupt operation unclaimable without discarding it');
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
values ('account.cleanup', 'profile', '65000000-0000-4000-8000-000000000006', '{}'::jsonb);
create temporary table profile_media_alert_repeat_claimed as
select * from public.claim_outbox_events(100, 'alert-repeat-worker');
select is((select count(*) from profile_media_alert_repeat_claimed where aggregate_id = '65000000-0000-4000-8000-000000000006'), 1::bigint, 'repeated scheduler repair remains fail-isolated when alert storage stays unavailable');

select * from finish();
rollback;
