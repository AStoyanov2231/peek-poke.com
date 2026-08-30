begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email)
values
  ('40000000-0000-4000-8000-000000000001', 'profile-owner@test.invalid'),
  ('40000000-0000-4000-8000-000000000002', 'profile-pending@test.invalid'),
  ('40000000-0000-4000-8000-000000000003', 'profile-accepted@test.invalid'),
  ('40000000-0000-4000-8000-000000000004', 'profile-dm@test.invalid'),
  ('40000000-0000-4000-8000-000000000005', 'profile-unrelated@test.invalid'),
  ('40000000-0000-4000-8000-000000000006', 'profile-owner-blocked@test.invalid'),
  ('40000000-0000-4000-8000-000000000007', 'profile-blocks-owner@test.invalid'),
  ('40000000-0000-4000-8000-000000000008', 'profile-deleted@test.invalid'),
  ('40000000-0000-4000-8000-000000000009', 'profile-accepted-delete@test.invalid');

insert into public.profiles (id, auth_user_id, username, display_name)
values
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'profile_owner', 'Owner'),
  ('40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'profile_pending', 'Pending'),
  ('40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'profile_accepted', 'Accepted'),
  ('40000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'profile_dm', 'DM'),
  ('40000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'profile_unrelated', 'Unrelated'),
  ('40000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006', 'profile_owner_blocked', 'Owner Blocked'),
  ('40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000007', 'profile_blocks_owner', 'Blocks Owner'),
  ('40000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000008', 'profile_deleted', 'Deleted'),
  ('40000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000009', 'profile_accepted_delete', 'Accepted Delete');

update public.profiles
set deleted_at = now()
where id = '40000000-0000-4000-8000-000000000008';

insert into public.user_blocks (blocker_id, blocked_id)
values
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006'),
  ('40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001');

insert into public.friendships (id, requester_id, addressee_id, status)
values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'pending'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'accepted'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000009', 'accepted');

insert into public.dm_threads (id, participant_1_id, participant_2_id)
values
  ('42000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'),
  ('42000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006'),
  ('42000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000008');

select has_trigger(
  'public',
  'profiles',
  'enqueue_profile_updated_after_public_change',
  'profiles has the durable public-field update trigger'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_catalog
    where index_catalog.schemaname = 'public'
      and index_catalog.tablename = 'friendships'
      and index_catalog.indexname = 'friendships_profile_fanout_requester_idx'
      and index_catalog.indexdef like '%(requester_id, addressee_id)%'
      and index_catalog.indexdef like '%WHERE%'
      and index_catalog.indexdef like '%pending%'
      and index_catalog.indexdef like '%accepted%'
  ),
  'requester-first fanout index covers the pair and active statuses'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_catalog
    where index_catalog.schemaname = 'public'
      and index_catalog.tablename = 'friendships'
      and index_catalog.indexname = 'friendships_profile_fanout_addressee_idx'
      and index_catalog.indexdef like '%(addressee_id, requester_id)%'
      and index_catalog.indexdef like '%WHERE%'
      and index_catalog.indexdef like '%pending%'
      and index_catalog.indexdef like '%accepted%'
  ),
  'addressee-first fanout index covers the pair and active statuses'
);

update public.profiles
set display_name = 'Owner Updated'
where id = '40000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated'),
  1::bigint,
  'a real public-field change enqueues one source event'
);
select is(
  (select payload from public.outbox_events where event_type = 'profile.updated'),
  '{"profile_id":"40000000-0000-4000-8000-000000000001"}'::jsonb,
  'source payload contains only the public profile id'
);

update public.profiles
set display_name = display_name
where id = '40000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated'),
  1::bigint,
  'a no-op update enqueues nothing'
);

update public.outbox_events
set status = 'processing', locked_by = 'pgtap-profile-worker', locked_at = now()
where event_type = 'profile.updated';

select is(
  public.expand_profile_updated_event(
    (select id from public.outbox_events where event_type = 'profile.updated'),
    'pgtap-profile-worker'
  ),
  5,
  'fanout inserts owner and every deduped known counterpart'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated.hint'),
  5::bigint,
  'fanout creates five durable per-user hints'
);
select is(
  (select count(distinct payload ->> 'recipient_id') from public.outbox_events where event_type = 'profile.updated.hint'),
  5::bigint,
  'recipient hints are deduped across friendship and DM membership'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated.hint' and payload ->> 'recipient_id' = '40000000-0000-4000-8000-000000000002'),
  1::bigint,
  'a friendship and DM counterpart receives one hint row'
);
select ok(
  not exists (
    select 1 from public.outbox_events
    where event_type = 'profile.updated.hint'
      and payload ->> 'recipient_id' = '40000000-0000-4000-8000-000000000005'
  ),
  'nonrecipient receives no hint row'
);
select ok(
  not exists (
    select 1 from public.outbox_events
    where event_type = 'profile.updated.hint'
      and payload ->> 'recipient_id' = '40000000-0000-4000-8000-000000000006'
  ),
  'a counterpart blocked by the owner receives no hint row'
);
select ok(
  not exists (
    select 1 from public.outbox_events
    where event_type = 'profile.updated.hint'
      and payload ->> 'recipient_id' = '40000000-0000-4000-8000-000000000007'
  ),
  'a counterpart who blocked the owner receives no hint row'
);
select ok(
  not exists (
    select 1 from public.outbox_events
    where event_type = 'profile.updated.hint'
      and payload ->> 'recipient_id' = '40000000-0000-4000-8000-000000000008'
  ),
  'a deleted DM counterpart receives no hint row'
);
select ok(
  public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002'
  ),
  'an overlapping unblocked live counterpart remains deliverable'
);
select ok(
  public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003'
  ),
  'an accepted friendship remains deliverable'
);
select ok(
  public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  ),
  'a current DM counterpart remains deliverable without friendship'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000005'
  ),
  'an unrelated live recipient is not deliverable'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000099',
    '40000000-0000-4000-8000-000000000002'
  ),
  'a missing source profile is not deliverable'
);
select ok(
  public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  'the live owner remains deliverable'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000006'
  ),
  'delivery recheck rejects owner-to-counterpart block direction'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000007'
  ),
  'delivery recheck rejects counterpart-to-owner block direction'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000008'
  ),
  'delivery recheck rejects a deleted recipient'
);

delete from public.friendships
where id = '41000000-0000-4000-8000-000000000002';
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003'
  ),
  'a declined or removed friendship without a DM suppresses delivery'
);

delete from public.friendships
where id = '41000000-0000-4000-8000-000000000001';
select ok(
  public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002'
  ),
  'a removed friendship remains deliverable when a current DM exists'
);

insert into public.user_blocks (blocker_id, blocked_id)
values ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004');
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004'
  ),
  'a block committed after expansion suppresses delivery'
);

update public.profiles
set deleted_at = now()
where id = '40000000-0000-4000-8000-000000000009';
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000009'
  ),
  'a deletion committed after expansion suppresses delivery'
);
select is(
  public.expand_profile_updated_event(
    (select id from public.outbox_events where event_type = 'profile.updated'),
    'pgtap-profile-worker'
  ),
  0,
  'replay inserts no duplicate recipient hints'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated.hint'),
  5::bigint,
  'replay preserves one row per recipient'
);

update public.profiles
set deleted_at = now()
where id = '40000000-0000-4000-8000-000000000001';
update public.profiles
set display_name = 'Deleted Owner'
where id = '40000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.outbox_events where event_type = 'profile.updated'),
  1::bigint,
  'deleted profile changes do not expose update hints'
);
select ok(
  not public.can_deliver_profile_updated_hint(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  'a deleted owner no longer receives its own hint'
);

select ok(
  not exists (
    select 1
    from information_schema.routine_privileges privilege
    where privilege.specific_schema = 'public'
      and privilege.routine_name = 'expand_profile_updated_event'
      and privilege.grantee = 'PUBLIC'
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot expand profile fanout'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.expand_profile_updated_event(uuid,text)', 'EXECUTE'),
  'anon cannot expand profile fanout'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.expand_profile_updated_event(uuid,text)', 'EXECUTE'),
  'authenticated cannot expand profile fanout'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.expand_profile_updated_event(uuid,text)', 'EXECUTE'),
  'service role can expand profile fanout'
);
select ok(
  not exists (
    select 1
    from information_schema.routine_privileges privilege
    where privilege.specific_schema = 'public'
      and privilege.routine_name = 'can_deliver_profile_updated_hint'
      and privilege.grantee = 'PUBLIC'
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot bypass the profile hint delivery guard'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.can_deliver_profile_updated_hint(uuid,uuid)', 'EXECUTE'),
  'anon cannot call the profile hint delivery guard'
);
select ok(
  not pg_catalog.has_function_privilege('authenticated', 'public.can_deliver_profile_updated_hint(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot call the profile hint delivery guard'
);
select ok(
  pg_catalog.has_function_privilege('service_role', 'public.can_deliver_profile_updated_hint(uuid,uuid)', 'EXECUTE'),
  'service role can call the profile hint delivery guard'
);
select ok(
  not exists (
    select 1 from public.outbox_events
    where event_type = 'profile.updated.hint'
      and (payload ? 'balance' or payload ? 'display_name' or payload ? 'bio')
  ),
  'durable hints contain no balance or private profile payload'
);

select * from finish();
rollback;
