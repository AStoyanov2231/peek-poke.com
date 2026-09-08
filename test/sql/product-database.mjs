import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = new URL("../..", import.meta.url);
const ids = {
  alex: "11111111-1111-4111-8111-111111111111",
  blair: "22222222-2222-4222-8222-222222222222",
  casey: "33333333-3333-4333-8333-333333333333",
  dana: "44444444-4444-4444-8444-444444444444",
  erin: "55555555-5555-4555-8555-555555555555",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sql(path) {
  return readFile(new URL(path, root), "utf8");
}

const db = await PGlite.create({ extensions: { pgcrypto } });
try {
  // This fixture contains only metadata verified from the hosted schema. It is
  // intentionally not a substitute for the legacy friendship/outbox baseline.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema app_private; create schema auth; create schema realtime;
    create table realtime.messages (id bigint primary key, topic text, extension text, private boolean);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.profiles (id uuid primary key, username text not null, display_name text, avatar_url text, location_text text, is_online boolean not null default false, last_seen_at timestamptz, deleted_at timestamptz, onboarding_completed boolean not null default true);
    create table public.user_blocks (id uuid primary key default gen_random_uuid(), blocker_id uuid not null references public.profiles(id), blocked_id uuid not null references public.profiles(id));
    create table public.friendships (id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id), addressee_id uuid not null references public.profiles(id), status text not null, requested_at timestamptz not null default now(), responded_at timestamptz);
    -- Legacy rows and composite RPCs referenced by the assembled age migration.
    -- These are metadata-shaped compiler fixtures, not a reconstructed baseline.
    create type public.friendship_status as enum ('pending', 'accepted', 'declined', 'blocked');
    create table public.dm_messages (id uuid primary key default gen_random_uuid(), thread_id uuid, sender_id uuid, client_id uuid, content text, message_type text default 'text', media_url text, media_thumbnail_url text, reply_to_id uuid, sequence bigint default 0, is_read boolean default false, is_deleted boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.call_sessions (id uuid primary key default gen_random_uuid(), thread_id uuid, initiator_id uuid, recipient_id uuid, status text, created_at timestamptz default now(), updated_at timestamptz default now(), ended_at timestamptz, answered_at timestamptz, offer_sdp text, answer_sdp text, version bigint default 0);
    create table public.call_signal_commands (id uuid primary key default gen_random_uuid(), call_session_id uuid, actor_id uuid, command text, client_id uuid, created_at timestamptz default now());
    create table public.shared_groups (id uuid primary key default gen_random_uuid(), name text, created_by uuid, created_at timestamptz default now(), next_message_sequence bigint default 0, last_message_at timestamptz, last_message_preview text);
    create table public.shared_group_messages (id uuid primary key default gen_random_uuid(), group_id uuid, sender_id uuid, client_id uuid, content text, sequence bigint default 0, is_read boolean default false, created_at timestamptz default now());
    create table public.shared_group_delivery_leases (group_id uuid, user_id uuid, lease_token uuid, leased_at timestamptz default now(), primary key(group_id,user_id));
    create table public.dm_media_claims (message_id uuid primary key, claimant_id uuid, claimed_at timestamptz default now());
    create table public.dm_media_cleanup_snapshots (message_id uuid primary key, payload jsonb default '{}'::jsonb);
    create table public.dm_media_path_generations (path text primary key, generation bigint default 0);
    create table public.chat_rooms (id uuid primary key default gen_random_uuid(), created_by uuid, created_at timestamptz default now());
    create table public.chat_room_members (room_id uuid, user_id uuid, primary key(room_id,user_id));
    create table public.chat_room_messages (id uuid primary key default gen_random_uuid(), room_id uuid, sender_id uuid, reply_to_id uuid, created_at timestamptz default now());
    -- Legacy function signatures are present only so migration 18 can revoke
    -- retired browser grants without reconstructing their unrelated bodies.
    create function public.get_chat_room_summary(uuid) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function public.get_chat_room_unread_count() returns integer language sql stable as $$ select 0 $$;
    create function public.list_chat_room_summaries(integer, timestamptz, uuid) returns table(id uuid) language sql stable as $$ select null::uuid where false $$;
    grant execute on function public.get_chat_room_summary(uuid), public.get_chat_room_unread_count(), public.list_chat_room_summaries(integer, timestamptz, uuid) to authenticated;
    create table public.user_locations (user_id uuid primary key references public.profiles(id), lat double precision not null, lng double precision not null, updated_at timestamptz not null default now());
    create table public.interest_tags (id uuid primary key default gen_random_uuid(), name text not null, icon text);
    create table public.profile_interests (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), tag_id uuid not null references public.interest_tags(id));
    create table public.user_coins (user_id uuid primary key references public.profiles(id), balance integer not null default 5, updated_at timestamptz not null default now());
    create table public.coin_transactions (id uuid primary key default gen_random_uuid(), user_id uuid, amount integer, reason text, related_user_id uuid);
    create table public.idempotency_records (actor_id uuid not null, operation text not null, key text not null, request_hash text not null, response_status integer, response_body jsonb, response_retry_after_seconds integer, primary key(actor_id,operation,key));
    create table public.friendship_mutation_rate_limits (actor_id uuid not null, operation text not null, window_started_at timestamptz not null, request_count integer not null, updated_at timestamptz not null, primary key(actor_id,operation));
    create table public.outbox_events (id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_type text not null, aggregate_id text not null, payload jsonb not null);
    create unique index outbox_events_friendship_requested_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'friendship.requested';
    create unique index outbox_events_friendship_responded_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'friendship.responded';
    create unique index outbox_events_friendship_removed_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'friendship.removed';
    create unique index outbox_events_user_blocked_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'user.blocked';
    create unique index outbox_events_call_invite_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'call.invite';
    create unique index outbox_events_coin_meeting_awarded_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'coin.meeting_awarded';
    create unique index outbox_events_dm_media_cleanup_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'dm.media_cleanup';
    create unique index outbox_events_account_cleanup_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'account.cleanup';
    create unique index outbox_events_profile_media_moderation_aggregate_id_uidx on public.outbox_events(event_type, aggregate_id) where event_type = 'profile.media_moderation';
    create table public.friendship_refunds (friendship_id uuid primary key, requester_id uuid not null, addressee_id uuid not null, source text not null, coin_transaction_id uuid);
    create table public.dm_threads (id uuid primary key default gen_random_uuid(), participant_1_id uuid not null references public.profiles(id), participant_2_id uuid not null references public.profiles(id), last_message_at timestamptz, last_message_preview text, created_at timestamptz not null default now(), next_message_sequence bigint not null default 0, unique(participant_1_id, participant_2_id));
    create table public.dm_thread_members (thread_id uuid not null references public.dm_threads(id), user_id uuid not null references public.profiles(id), last_read_sequence bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(thread_id,user_id));
    create function public.add_dm_thread_members() returns trigger language plpgsql as $$ begin insert into public.dm_thread_members(thread_id,user_id) values (new.id,new.participant_1_id),(new.id,new.participant_2_id); return new; end $$;
    create trigger add_dm_thread_members_after_insert after insert on public.dm_threads for each row execute function public.add_dm_thread_members();
    create table public.shared_group_members (group_id uuid not null, user_id uuid not null, primary key(group_id,user_id));
    create table public.profile_photos (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), url text not null, is_avatar boolean not null default false, is_private boolean not null default false, approval_status text not null default 'approved', display_order integer not null default 0);
    create table public.friend_meetings (user_a_id uuid not null references public.profiles(id), user_b_id uuid not null references public.profiles(id), primary key(user_a_id,user_b_id));
    create function public.record_meeting_for_user(uuid, uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create extension if not exists pgcrypto;
    create schema extensions;
    create function extensions.gen_random_uuid() returns uuid language sql as $$ select public.gen_random_uuid() $$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
    create function extensions.digest(text, text) returns bytea language sql as $$ select public.digest($1, $2) $$;
    create function extensions.similarity(text, text) returns real language sql immutable as $$ select 0::real $$;
  `);
  await db.exec(await sql("supabase/migrations/20260908113140_free_social_graph_and_coarse_nearby.sql"));
  await db.exec(await sql("supabase/migrations/20260908113317_product_social_intent.sql"));
  await db.exec(await sql("supabase/migrations/20260908113327_product_plans.sql"));
  await db.exec(await sql("supabase/migrations/20260908113338_meeting_social_eligibility.sql"));
  await db.exec(await sql("supabase/migrations/20260908113347_mutual_meetup_acknowledgements.sql"));
  await db.exec(await sql("supabase/migrations/20260908113454_privacy_location_retention.sql"));
  await db.exec(await sql("supabase/migrations/20260908113507_discovery_audience_preferences.sql"));
  await db.exec(await sql("supabase/migrations/20260908113518_plan_nearby_discovery.sql"));
  await db.exec(await sql("supabase/migrations/20260908113529_private_product_funnel_metrics.sql"));
  await db.exec(await sql("supabase/migrations/20260908113540_profile_social_context.sql"));
  await db.exec(await sql("supabase/migrations/20260908113628_private_product_activity_metrics.sql"));
  await db.exec(await sql("supabase/migrations/20260908113639_plan_meetup_attribution.sql"));
  await db.exec(await sql("supabase/migrations/20260908113651_plan_recent_member_lifecycle.sql"));
  await db.exec(await sql("supabase/migrations/20260908113704_legacy_sql_special_forms.sql"));

  await db.query("insert into public.profiles(id,username,display_name) values ($1,'alex','Alex'),($2,'blair','Blair'),($3,'casey','Casey'),($4,'dana','Dana'),($5,'erin','Erin')", [ids.alex, ids.blair, ids.casey, ids.dana, ids.erin]);

  const serviceRelations = [
    "public.user_availabilities",
    "public.pokes",
    "public.social_idempotency_records",
    "public.plans",
    "public.plan_members",
    "public.plan_share_tokens",
    "public.plan_join_idempotency",
    "public.plan_create_idempotency",
  ];
  const servicePrivileges = ["select", "insert", "update", "delete"];
  const missingServiceGrants = await db.query(
    "select count(*)::int count from unnest($1::text[]) relation_name cross join unnest($2::text[]) privilege where not has_table_privilege('service_role', relation_name, privilege)",
    [serviceRelations, servicePrivileges],
  );
  const missingWorkerExecute = await db.query(
    "select has_function_privilege('service_role', 'public.authorize_poke_delivery(uuid,text,uuid,uuid,uuid)'::regprocedure, 'execute') allowed",
  );
  let missingPokeOutboxIndex = false;
  try {
    await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Requires a Poke outbox index','poke-index-repro01')", [ids.alex, ids.blair]);
  } catch (error) {
    missingPokeOutboxIndex = /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(String(error));
  }
  assert(missingPokeOutboxIndex, "the hosted outbox baseline must reproduce the missing Poke partial-index error before the corrective migration");
  assert(missingServiceGrants.rows[0].count === serviceRelations.length * servicePrivileges.length, "the pre-correction baseline must deny every service-role CRUD privilege");
  assert(missingWorkerExecute.rows[0].allowed === false, "the pre-correction baseline must reproduce the outbox worker execute denial");

  await db.exec(await sql("supabase/migrations/20260908115135_product_social_runtime_grants_and_outbox_indexes.sql"));
  const repairedServiceGrants = await db.query(
    "select count(*)::int count from unnest($1::text[]) relation_name cross join unnest($2::text[]) privilege where has_table_privilege('service_role', relation_name, privilege)",
    [serviceRelations, servicePrivileges],
  );
  const repairedWorkerExecute = await db.query(
    "select has_function_privilege('service_role', 'public.authorize_poke_delivery(uuid,text,uuid,uuid,uuid)'::regprocedure, 'execute') allowed",
  );
  const browserRelationGrants = await db.query(
    "select count(*)::int count from unnest($1::text[]) relation_name cross join unnest($2::text[]) privilege cross join unnest(array['anon','authenticated']::text[]) role_name where has_table_privilege(role_name, relation_name, privilege)",
    [serviceRelations, servicePrivileges],
  );
  const browserWorkerExecute = await db.query(
    "select count(*)::int count from unnest(array['anon','authenticated']::text[]) role_name where has_function_privilege(role_name, 'public.authorize_poke_delivery(uuid,text,uuid,uuid,uuid)'::regprocedure, 'execute')",
  );
  const repairedIndexes = await db.query(
    "select count(*)::int count from unnest($1::text[]) index_name where to_regclass(index_name) is not null",
    [[
      "public.outbox_events_poke_created_aggregate_id_uidx",
      "public.outbox_events_poke_accepted_aggregate_id_uidx",
      "public.plans_owner_id_idx",
      "public.meetup_acknowledgements_user_b_id_idx",
      "public.plan_meetup_acknowledgements_user_a_id_idx",
      "public.plan_meetup_acknowledgements_user_b_id_idx",
    ]],
  );
  const correctedPoke = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Poke outbox index repaired','poke-index-fixed01') payload", [ids.alex, ids.blair]);
  assert(repairedServiceGrants.rows[0].count === serviceRelations.length * servicePrivileges.length, "the corrective migration must grant every service-role CRUD privilege on each server-only social table");
  assert(repairedWorkerExecute.rows[0].allowed === true, "the corrective migration must grant the outbox worker execute access");
  assert(browserRelationGrants.rows[0].count === 0, "the corrective migration must not grant browser roles direct social-table access");
  assert(browserWorkerExecute.rows[0].count === 0, "the corrective migration must not grant browser roles the worker-only delivery function");
  assert(repairedIndexes.rows[0].count === 6, "the corrective migration must create both Poke outbox indexes and all four approved lookup indexes");
  assert(correctedPoke.rows[0].payload.poke?.id, "the corrective Poke outbox index must allow create_poke to complete");

  await db.exec(`
    create function public.erase_account_data(p_user_id uuid)
    returns jsonb language plpgsql security definer set search_path = '' as $$
    begin
      update public.profiles set deleted_at = now() where id = p_user_id;
      return jsonb_build_object('success', true);
    end;
    $$;
  `);
  const staleErasurePlanId = "44444444-0000-4000-8000-000000000001";
  await db.query("insert into public.plans(id,owner_id,activity,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'walk',now()+interval '2 hours','Stale plan','private',2,'active')", [staleErasurePlanId, ids.dana]);
  await db.query("select public.erase_account_data($1::uuid)", [ids.dana]);
  const stalePlanAfterErasure = await db.query("select count(*)::int count from public.plans where id=$1::uuid", [staleErasurePlanId]);
  assert(stalePlanAfterErasure.rows[0].count === 1, "the pre-correction account erasure must reproduce an owned Plan surviving a soft tombstone");

  await db.exec(await sql("supabase/migrations/20260908121358_account_erasure_product_social_records.sql"));
  const repairedStalePlan = await db.query("select count(*)::int count from public.plans where id=$1::uuid", [staleErasurePlanId]);
  assert(repairedStalePlan.rows[0].count === 0, "the account-erasure correction must remove Plans left by prior soft-deleted accounts");
  let tombstonedChildRejected = false;
  try {
    await db.query("insert into public.user_availabilities(user_id,activity,expires_at) values ($1::uuid,'walk',now()+interval '1 hour')", [ids.dana]);
  } catch (error) {
    tombstonedChildRejected = error?.code === '23514';
  }
  let tombstonedOutboxRejected = false;
  try {
    await db.query("insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload) values ('poke.created','poke','deleted-account-race',jsonb_build_object('sender_id',$1::uuid,'recipient_id',$2::uuid))", [ids.dana, ids.casey]);
  } catch (error) {
    tombstonedOutboxRejected = error?.code === '23514';
  }
  assert(tombstonedChildRejected && tombstonedOutboxRejected, "post-tombstone writes must fail so a concurrent service RPC cannot recreate erased social data");

  const currentErasurePlanId = "55555555-0000-4000-8000-000000000001";
  await db.query("insert into public.plans(id,owner_id,activity,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'walk',now()+interval '2 hours','Current plan','private',2,'active')", [currentErasurePlanId, ids.erin]);
  await db.query("insert into public.plan_members(plan_id,user_id,role) values ($1::uuid,$2::uuid,'owner')", [currentErasurePlanId, ids.erin]);
  await db.query("insert into public.plan_share_tokens(plan_id,token_hash,created_by) values ($1::uuid,decode(repeat('a',64),'hex'),$2::uuid)", [currentErasurePlanId, ids.erin]);
  await db.query("insert into public.plan_join_idempotency(actor_id,idempotency_key,request_hash,response_body) values ($1::uuid,'erase-plan-join-0001',repeat('a',64),'{}'::jsonb)", [ids.erin]);
  await db.query("insert into public.plan_join_idempotency(actor_id,idempotency_key,request_hash,response_body) values ($1::uuid,'erase-peer-plan-join01',repeat('c',64),jsonb_build_object('plan',jsonb_build_object('id',$2::uuid,'owner_id',$3::uuid)))", [ids.casey, currentErasurePlanId, ids.erin]);
  await db.query("insert into public.plan_create_idempotency(actor_id,idempotency_key,request_hash,response_body) values ($1::uuid,'erase-plan-create-001',repeat('b',64),'{}'::jsonb)", [ids.erin]);
  await db.query("insert into public.social_idempotency_records(actor_id,operation,idempotency_key,request_fingerprint,response) values ($1::uuid,'create_poke','erase-social-poke01','erase','{}'::jsonb)", [ids.erin]);
  await db.query("insert into public.social_idempotency_records(actor_id,operation,idempotency_key,request_fingerprint,response) values ($1::uuid,'respond_to_poke','erase-peer-social01','erase',jsonb_build_object('poke',jsonb_build_object('senderId',$2::uuid,'recipientId',$1::uuid,'note','private')))", [ids.casey, ids.erin]);
  await db.query("insert into public.idempotency_records(actor_id,operation,key,request_hash,response_status,response_body) values ($1::uuid,'meetup:acknowledge','erase-peer-meetup01',repeat('d',64),200,jsonb_build_object('meetup',jsonb_build_object('peerId',$2::uuid)))", [ids.casey, ids.erin]);
  await db.query("insert into public.idempotency_records(actor_id,operation,key,request_hash,response_status,response_body) values ($1::uuid,'plan:meetup:acknowledge','erase-peer-plan-meet01',repeat('e',64),200,jsonb_build_object('acknowledgements',jsonb_build_array(jsonb_build_object('peerId',$2::uuid))))", [ids.casey, ids.erin]);
  await db.query("insert into public.user_availabilities(user_id,activity,expires_at) values ($1::uuid,'coffee',now()+interval '1 hour')", [ids.erin]);
  const erasurePoke = (await db.query("insert into public.pokes(sender_id,recipient_id,activity,note) values ($1::uuid,$2::uuid,'coffee','Erase this Poke') returning id", [ids.erin, ids.casey])).rows[0].id;
  await db.query("insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload) values ('poke.created','poke',$1::text,jsonb_build_object('sender_id',$2::uuid,'recipient_id',$3::uuid))", [erasurePoke, ids.erin, ids.casey]);
  await db.query("insert into public.meetup_acknowledgements(user_a_id,user_b_id,meetup_day,user_a_confirmed_at,expires_at) values ($1::uuid,$2::uuid,current_date,now(),now()+interval '1 day')", [ids.casey, ids.erin]);
  await db.query("insert into public.plan_meetup_acknowledgements(plan_id,user_a_id,user_b_id,user_a_confirmed_at,expires_at) values ($1::uuid,$2::uuid,$3::uuid,now(),now()+interval '1 day')", [currentErasurePlanId, ids.casey, ids.erin]);
  await db.query("insert into public.discovery_preferences(user_id,audience) values ($1::uuid,'hidden')", [ids.erin]);
  await db.query("insert into public.product_first_activations(user_id,source) values ($1::uuid,'poke') on conflict do nothing", [ids.erin]);
  await db.query("insert into public.product_activity_days(user_id,activity_day,kind) values ($1::uuid,current_date,'plan') on conflict do nothing", [ids.erin]);
  await db.query("insert into public.product_discovery_daily_activity(user_id,activity_day,opportunities_2km,opportunities_10km,opportunities_25km) values ($1::uuid,current_date,1,2,3)", [ids.erin]);
  await db.query("select public.erase_account_data($1::uuid)", [ids.erin]);
  const erasedProductSocialRows = await db.query(`
    select
      (select count(*)::int from public.plans where owner_id=$1::uuid) +
      (select count(*)::int from public.plan_members where user_id=$1::uuid) +
      (select count(*)::int from public.plan_share_tokens where created_by=$1::uuid) +
      (select count(*)::int from public.plan_join_idempotency where actor_id=$1::uuid or response_body -> 'plan' ->> 'owner_id'=$1::text) +
      (select count(*)::int from public.plan_create_idempotency where actor_id=$1::uuid) +
      (select count(*)::int from public.social_idempotency_records where actor_id=$1::uuid or response -> 'poke' ->> 'senderId'=$1::text or response -> 'poke' ->> 'recipientId'=$1::text) +
      (select count(*)::int from public.idempotency_records where actor_id=$1::uuid or response_body -> 'meetup' ->> 'peerId'=$1::text or response_body @> jsonb_build_object('acknowledgements',jsonb_build_array(jsonb_build_object('peerId',$1::uuid)))) +
      (select count(*)::int from public.user_availabilities where user_id=$1::uuid) +
      (select count(*)::int from public.pokes where sender_id=$1::uuid or recipient_id=$1::uuid) +
      (select count(*)::int from public.outbox_events where event_type in ('poke.created','poke.accepted') and (payload->>'sender_id'=$1::text or payload->>'recipient_id'=$1::text)) +
      (select count(*)::int from public.meetup_acknowledgements where user_a_id=$1::uuid or user_b_id=$1::uuid) +
      (select count(*)::int from public.plan_meetup_acknowledgements where user_a_id=$1::uuid or user_b_id=$1::uuid) +
      (select count(*)::int from public.discovery_preferences where user_id=$1::uuid) +
      (select count(*)::int from public.product_first_activations where user_id=$1::uuid) +
      (select count(*)::int from public.product_activity_days where user_id=$1::uuid) +
      (select count(*)::int from public.product_discovery_daily_activity where user_id=$1::uuid) count
  `, [ids.erin]);
  assert(erasedProductSocialRows.rows[0].count === 0, "the account-erasure trigger must remove every scoped product-social record and peer snapshot in the same tombstone transaction");
  const unrelatedCaseyAvailability = await db.query("insert into public.user_availabilities(user_id,activity,expires_at) values ($1::uuid,'walk',now()+interval '1 hour') returning user_id", [ids.casey]);
  assert(unrelatedCaseyAvailability.rows[0].user_id === ids.casey, "account erasure must not remove unrelated active accounts or their records");

  await db.query("insert into public.user_coins(user_id,balance) values ($1,5),($2,5),($3,5)", [ids.alex, ids.blair, ids.casey]);
  await db.query("insert into public.user_locations(user_id,lat,lng) values ($1,42.6977,23.3219),($2,42.7030,23.3300),($3,42.9000,23.9000)", [ids.alex, ids.blair, ids.casey]);
  const tag = (await db.query("insert into public.interest_tags(name) values ('Coffee') returning id")).rows[0].id;
  await db.query("insert into public.profile_interests(user_id,tag_id) values ($1,$3),($2,$3)", [ids.alex, ids.blair, tag]);

  const friendRequest = await db.query("select public.send_friend_request_idempotent($1::uuid,$2::uuid,'friend_request:create','free-friend-request1',repeat('d',64),'free-request-001') payload", [ids.alex, ids.casey]);
  const friendRequestReplay = await db.query("select public.send_friend_request_idempotent($1::uuid,$2::uuid,'friend_request:create','free-friend-request1',repeat('d',64),'free-request-001') payload", [ids.alex, ids.casey]);
  const freeFriendshipId = friendRequest.rows[0].payload.response_body.friendship.id;
  const freeCharge = await db.query("select amount from public.friendship_request_charges where friendship_id=$1::uuid", [freeFriendshipId]);
  assert(friendRequest.rows[0].payload.response_status === 200 && friendRequestReplay.rows[0].payload.replayed === true, "free friend requests must be idempotent");
  assert(freeCharge.rows[0].amount === 0, "new friend requests must record a zero-cost marker");
  const nonfriendDm = await db.query("select public.create_or_find_thread($1::uuid,$2::uuid) payload", [ids.alex, ids.casey]);
  const coinsAfterFreeActions = await db.query("select sum(balance)::int balance from public.user_coins");
  assert(nonfriendDm.rows[0].payload.is_new === true && coinsAfterFreeActions.rows[0].balance === 15, "nonfriend DMs must be free");

  const legacyFriendship = (await db.query("insert into public.friendships(requester_id,addressee_id,status) values ($1::uuid,$2::uuid,'pending') returning id", [ids.casey, ids.blair])).rows[0].id;
  await db.query("update public.user_coins set balance=4 where user_id=$1::uuid", [ids.casey]);
  const legacyRefund = await db.query("select public.friendship_removal_core($1::uuid,$2::uuid,'delete') payload", [legacyFriendship, ids.casey]);
  const legacyRefundReplay = await db.query("select public.friendship_removal_core($1::uuid,$2::uuid,'delete') payload", [legacyFriendship, ids.casey]);
  const legacyRefundTransactions = await db.query("select count(*)::int count from public.coin_transactions where user_id=$1::uuid and reason='request_cancelled_refund'", [ids.casey]);
  assert(legacyRefund.rows[0].payload.refunded === true && legacyRefundReplay.rows[0].payload.found === false, "legacy pending requests must refund once");
  assert(legacyRefundTransactions.rows[0].count === 1, "legacy refund must create exactly one ledger entry");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.blair, ids.casey]);
  const blockedFriendRequest = await db.query("select public.send_friend_request_idempotent($1::uuid,$2::uuid,'friend_request:create','blocked-friend-req1',repeat('e',64),'blocked-request01') payload", [ids.casey, ids.blair]);
  assert(blockedFriendRequest.rows[0].payload.response_body.code === "BLOCKED", "blocks must reject friend requests in either direction");
  await db.query("delete from public.user_blocks");

  await db.query("select public.upsert_user_availability($1::uuid,'coffee',null,60)", [ids.alex]);
  await db.query("select public.upsert_user_availability($1::uuid,'coffee',null,60)", [ids.blair]);
  const discovery = await db.query("select public.get_available_people($1::uuid,20,25) payload", [ids.alex]);
  assert(discovery.rows[0].payload.people.length === 1, "discovery must enforce the radius");
  assert(discovery.rows[0].payload.people[0].distanceKm % 2 === 0, "discovery must return a broad distance bucket");
  const defaultNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(defaultNearby.rows.some((row) => row.user_id === ids.blair), "the default everyone audience must preserve existing discovery");

  await db.query("select public.update_discovery_preference($1::uuid,'hidden'::public.discovery_audience)", [ids.blair]);
  const hiddenNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  const hiddenAvailability = await db.query("select public.get_available_people($1::uuid,20,25) payload", [ids.alex]);
  assert(!hiddenNearby.rows.some((row) => row.user_id === ids.blair) && hiddenAvailability.rows[0].payload.people.length === 0, "hidden discovery must take effect immediately across nearby and availability");

  await db.query("select public.update_discovery_preference($1::uuid,'friends'::public.discovery_audience)", [ids.blair]);
  await db.query("insert into public.friendships(requester_id,addressee_id,status) values ($1::uuid,$2::uuid,'accepted')", [ids.alex, ids.blair]);
  const friendsNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(friendsNearby.rows.some((row) => row.user_id === ids.blair), "friends-only discovery must include accepted friends");
  await db.query("delete from public.friendships where (requester_id=$1::uuid and addressee_id=$2::uuid) or (requester_id=$2::uuid and addressee_id=$1::uuid)", [ids.alex, ids.blair]);
  const nonfriendNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(!nonfriendNearby.rows.some((row) => row.user_id === ids.blair), "friends-only discovery must exclude nonfriends");

  await db.query("select public.update_discovery_preference($1::uuid,'friends_of_friends'::public.discovery_audience)", [ids.blair]);
  await db.query("insert into public.friendships(requester_id,addressee_id,status) values ($1::uuid,$2::uuid,'accepted')", [ids.alex, ids.blair]);
  const directFofNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(directFofNearby.rows.some((row) => row.user_id === ids.blair), "friends-and-their-friends discovery must include a direct accepted friend");
  await db.query("delete from public.friendships where requester_id=$1::uuid and addressee_id=$2::uuid", [ids.alex, ids.blair]);
  await db.query("insert into public.friendships(requester_id,addressee_id,status) values ($1::uuid,$2::uuid,'accepted'),($1::uuid,$3::uuid,'accepted')", [ids.casey, ids.alex, ids.blair]);
  const fofNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(fofNearby.rows.some((row) => row.user_id === ids.blair), "friends-of-friends discovery must include an accepted mutual friend");
  await db.query("delete from public.friendships where requester_id=$1::uuid", [ids.casey]);

  await db.query("select public.update_discovery_preference($1::uuid,'circles'::public.discovery_audience)", [ids.blair]);
  const circleId = (await db.query("select gen_random_uuid() id")).rows[0].id;
  await db.query("insert into public.shared_group_members(group_id,user_id) values ($1::uuid,$2::uuid),($1::uuid,$3::uuid)", [circleId, ids.alex, ids.blair]);
  const circlesNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(circlesNearby.rows.some((row) => row.user_id === ids.blair), "circle discovery must require shared active membership");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const blockedNearby = await db.query("select * from public.nearby_users_for_user($1::uuid,2)", [ids.alex]);
  assert(!blockedNearby.rows.some((row) => row.user_id === ids.blair), "blocks must override every discovery audience");
  await db.query("delete from public.user_blocks where blocker_id=$1::uuid and blocked_id=$2::uuid", [ids.alex, ids.blair]);
  await db.query("delete from public.shared_group_members where group_id=$1::uuid", [circleId]);
  await db.query("select public.update_discovery_preference($1::uuid,'everyone'::public.discovery_audience)", [ids.blair]);
  const discoveryRoleGrants = await db.query("select has_function_privilege('authenticated', 'public.read_discovery_preference(uuid)', 'EXECUTE') anonymous_read, has_function_privilege('authenticated', 'public.update_discovery_preference(uuid, public.discovery_audience)', 'EXECUTE') anonymous_write, has_function_privilege('service_role', 'public.update_discovery_preference(uuid, public.discovery_audience)', 'EXECUTE') service_write");
  assert(discoveryRoleGrants.rows[0].anonymous_read === false && discoveryRoleGrants.rows[0].anonymous_write === false && discoveryRoleGrants.rows[0].service_write === true, "discovery preference functions must be service-only");
  await db.query("update public.user_locations set updated_at=now()-interval '11 minutes' where user_id=$1::uuid", [ids.blair]);
  const staleAvailability = await db.query("select public.get_available_people($1::uuid,20,25) payload", [ids.alex]);
  assert(staleAvailability.rows[0].payload.people.length === 0, "availability must use the same ten-minute location freshness window as nearby");
  await db.query("update public.user_locations set updated_at=now() where user_id=$1::uuid", [ids.blair]);

  const transactionsBeforePoke = await db.query("select count(*)::int count from public.coin_transactions");
  const sent = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Want coffee?','poke-create-key01') payload", [ids.alex, ids.blair]);
  const replay = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Want coffee?','poke-create-key01') payload", [ids.alex, ids.blair]);
  assert(sent.rows[0].payload.replayed === false && replay.rows[0].payload.replayed === true, "Poke creation must replay exactly once");
  const pokeId = sent.rows[0].payload.poke.id;
  const createdOutbox = await db.query("select payload from public.outbox_events where event_type='poke.created' and aggregate_id=$1::text", [pokeId]);
  assert(createdOutbox.rows.length === 1 && !Object.hasOwn(createdOutbox.rows[0].payload, "note"), "a created Poke must enqueue one identifier-only delivery event");
  const accepted = await db.query("select public.respond_to_poke($1::uuid,$2::uuid,'accept','poke-accept-key01') payload", [ids.blair, pokeId]);
  const threadId = accepted.rows[0].payload.threadId;
  assert(threadId, "accepted Pokes must return a DM thread");
  const membership = await db.query("select count(*)::int count from public.dm_thread_members where thread_id=$1::uuid", [threadId]);
  const coins = await db.query("select sum(balance)::int balance from public.user_coins");
  const transactions = await db.query("select count(*)::int count from public.coin_transactions");
  assert(membership.rows[0].count === 2, "accepted Pokes must make both users DM members");
  assert(coins.rows[0].balance === 15 && transactions.rows[0].count === transactionsBeforePoke.rows[0].count, "Poke acceptance must not charge either user");
  const acceptedOutbox = await db.query("select payload from public.outbox_events where event_type='poke.accepted' and aggregate_id=$1::text", [pokeId]);
  assert(acceptedOutbox.rows.length === 1 && acceptedOutbox.rows[0].payload.thread_id === threadId, "Poke acceptance must enqueue one chat handoff delivery event");
  const deliveryAuthorized = await db.query("select public.authorize_poke_delivery($1::uuid,'accepted',$2::uuid,$3::uuid,$4::uuid) payload", [pokeId, ids.alex, ids.blair, threadId]);
  assert(deliveryAuthorized.rows[0].payload.deliver === true, "Poke delivery must authorize only a current accepted relationship");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const deliveryBlocked = await db.query("select public.authorize_poke_delivery($1::uuid,'accepted',$2::uuid,$3::uuid,$4::uuid) payload", [pokeId, ids.alex, ids.blair, threadId]);
  assert(deliveryBlocked.rows[0].payload.deliver === false, "Poke delivery must suppress a blocked pair before external fanout");
  await db.query("delete from public.user_blocks");
  await db.query("update public.profiles set deleted_at=now() where id=$1::uuid", [ids.blair]);
  const deliveryDeleted = await db.query("select public.authorize_poke_delivery($1::uuid,'accepted',$2::uuid,$3::uuid,$4::uuid) payload", [pokeId, ids.alex, ids.blair, threadId]);
  assert(deliveryDeleted.rows[0].payload.deliver === false, "Poke delivery must suppress a deleted account before external fanout");
  await db.query("update public.profiles set deleted_at=null where id=$1::uuid", [ids.blair]);
  await db.query("insert into public.user_availabilities(user_id,activity,expires_at) values ($1::uuid,'coffee',now()+interval '1 hour')", [ids.blair]);
  await db.query("insert into public.pokes(sender_id,recipient_id,activity,status,responded_at,thread_id) values ($1::uuid,$2::uuid,'coffee','accepted',now(),$3::uuid)", [ids.alex, ids.blair, threadId]);

  const meetupWaiting = await db.query("select public.acknowledge_meetup_idempotent($1::uuid,$2::uuid,'meetup:acknowledge','meetup-ack-key-0001',repeat('f',64)) payload", [ids.alex, ids.blair]);
  const peerWaitingRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.blair, ids.alex]);
  const meetupConfirmed = await db.query("select public.acknowledge_meetup_idempotent($1::uuid,$2::uuid,'meetup:acknowledge','meetup-ack-key-0002',repeat('a',64)) payload", [ids.blair, ids.alex]);
  const meetupReplay = await db.query("select public.acknowledge_meetup_idempotent($1::uuid,$2::uuid,'meetup:acknowledge','meetup-ack-key-0001',repeat('f',64)) payload", [ids.alex, ids.blair]);
  assert(meetupWaiting.rows[0].payload.meetup.status === "waiting" && meetupWaiting.rows[0].payload.meetup.viewerConfirmed === true && peerWaitingRead.rows[0].payload.meetup.status === "waiting" && peerWaitingRead.rows[0].payload.meetup.viewerConfirmed === false && meetupConfirmed.rows[0].payload.meetup.status === "confirmed", "mutual meetup acknowledgement must require both people");
  assert(meetupReplay.rows[0].payload.replayed === true && meetupReplay.rows[0].payload.meetup.status === "waiting", "meetup acknowledgement retries must replay the caller response");
  const reciprocalRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.blair, ids.alex]);
  const originalRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  const unrelatedRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.alex, ids.casey]);
  assert(reciprocalRead.rows[0].payload.meetup.status === "confirmed" && reciprocalRead.rows[0].payload.meetup.viewerConfirmed === true, "the reciprocal participant must read the confirmed state");
  assert(originalRead.rows[0].payload.meetup.status === "confirmed" && originalRead.rows[0].payload.meetup.viewerConfirmed === true, "the original participant must refresh to the reciprocal confirmation");
  assert(unrelatedRead.rows[0].payload.meetup === null, "unrelated users must not read another pair's acknowledgement");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const blockedMeetupRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(blockedMeetupRead.rows[0].payload.error === "BLOCKED", "blocked participants must not read meetup acknowledgement state");
  await db.query("delete from public.user_blocks where blocker_id=$1::uuid and blocked_id=$2::uuid", [ids.alex, ids.blair]);
  await db.query("update public.meetup_acknowledgements set expires_at=now()-interval '1 second' where user_a_id=$1::uuid and user_b_id=$2::uuid", [ids.alex, ids.blair]);
  const expiredMeetupRead = await db.query("select public.read_meetup_acknowledgement($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(expiredMeetupRead.rows[0].payload.meetup === null, "expired meetup acknowledgements must not be readable");

  await db.query("update public.user_locations set lat=42.6978,lng=23.3220 where user_id=$1::uuid", [ids.blair]);
  await db.query("update public.user_coins set balance=4 where user_id in ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const meeting = await db.query("select public.record_meeting_for_user($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  const meetingReplay = await db.query("select public.record_meeting_for_user($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(meeting.rows[0].payload.success === true && meeting.rows[0].payload.awarded === true, "accepted Pokes must authorize one nearby meeting award");
  assert(meetingReplay.rows[0].payload.already_met === true, "meeting awards must be pair-idempotent");

  const expiring = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,null,'poke-expire-key01') payload", [ids.alex, ids.casey]);
  await db.query("update public.pokes set expires_at=now()-interval '1 second' where id=$1::uuid", [expiring.rows[0].payload.poke.id]);
  const expiredDelivery = await db.query("select public.authorize_poke_delivery($1::uuid,'received',$2::uuid,$3::uuid,null::uuid) payload", [expiring.rows[0].payload.poke.id, ids.alex, ids.casey]);
  assert(expiredDelivery.rows[0].payload.deliver === false, "Poke delivery must suppress an expired invitation before external fanout");
  const expired = await db.query("select public.respond_to_poke($1::uuid,$2::uuid,'accept','poke-expire-response01') payload", [ids.casey, expiring.rows[0].payload.poke.id]);
  assert(expired.rows[0].payload.error === "POKE_EXPIRED", "expired Pokes must never create a thread");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.casey]);
  const blocked = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,null,'poke-block-key001') payload", [ids.casey, ids.alex]);
  assert(blocked.rows[0].payload.error === "BLOCKED", "a block in either direction must reject Pokes");
  await db.query("delete from public.user_blocks");
  const blockedReplay = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,null,'poke-block-key001') payload", [ids.casey, ids.alex]);
  assert(blockedReplay.rows[0].payload.error === "BLOCKED" && blockedReplay.rows[0].payload.replayed === true, "terminal Poke errors must remain idempotent after conditions change");
  const expiredReplay = await db.query("select public.respond_to_poke($1::uuid,$2::uuid,'accept','poke-expire-response01') payload", [ids.casey, expiring.rows[0].payload.poke.id]);
  assert(expiredReplay.rows[0].payload.error === "POKE_EXPIRED" && expiredReplay.rows[0].payload.replayed === true, "terminal Poke response errors must replay after state changes");

  const plan = await db.query("select public.plan_create_v1($1::uuid,'coffee',null::text,now()+interval '1 hour','Cafe','open',null::uuid,2::smallint,$2::uuid,'plan-create-key01',repeat('a',64)) payload", [ids.alex, threadId]);
  const planId = plan.rows[0].payload.plan.id;
  const join = await db.query("select public.plan_join_v1($1::uuid,$2::uuid,'plan-join-key0001',repeat('b',64),null::text) payload", [ids.blair, planId]);
  const joinReplay = await db.query("select public.plan_join_v1($1::uuid,$2::uuid,'plan-join-key0001',repeat('b',64),null::text) payload", [ids.blair, planId]);
  const full = await db.query("select public.plan_join_v1($1::uuid,$2::uuid,'plan-join-key0002',repeat('c',64),null::text) payload", [ids.casey, planId]);
  assert(join.rows[0].payload.joined === true && joinReplay.rows[0].payload.joined === true, "Plan joins must replay without duplicate membership");
  assert(full.rows[0].payload.error === "FULL", "Plan capacity must be enforced transactionally");
  const contextCircleId = (await db.query("select gen_random_uuid() id")).rows[0].id;
  await db.query("insert into public.shared_group_members(group_id,user_id) values ($1::uuid,$2::uuid),($1::uuid,$3::uuid)", [contextCircleId, ids.alex, ids.blair]);
  const socialContext = await db.query("select public.get_profile_social_context($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(socialContext.rows[0].payload.availability !== null && socialContext.rows[0].payload.sharedCircles.length === 1 && socialContext.rows[0].payload.upcomingPlans.length === 1 && socialContext.rows[0].payload.mutualMeetups === 1, "profile context must return only bounded authorized social facts");
  await db.query("select public.update_discovery_preference($1::uuid,'hidden'::public.discovery_audience)", [ids.blair]);
  const hiddenContext = await db.query("select public.get_profile_social_context($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(hiddenContext.rows[0].payload.availability === null, "profile context must hide unavailable-by-audience availability");
  await db.query("select public.update_discovery_preference($1::uuid,'everyone'::public.discovery_audience)", [ids.blair]);
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const blockedContext = await db.query("select public.get_profile_social_context($1::uuid,$2::uuid) payload", [ids.alex, ids.blair]);
  assert(blockedContext.rows[0].payload.error === "NOT_FOUND", "blocked viewers must receive no profile social context");
  await db.query("delete from public.user_blocks where blocker_id=$1::uuid and blocked_id=$2::uuid", [ids.alex, ids.blair]);
  const contextRoleGate = await db.query("select has_function_privilege('authenticated', 'public.get_profile_social_context(uuid, uuid)', 'EXECUTE') app_read, has_function_privilege('service_role', 'public.get_profile_social_context(uuid, uuid)', 'EXECUTE') service_read");
  assert(contextRoleGate.rows[0].app_read === false && contextRoleGate.rows[0].service_read === true, "profile social context must be service-only");
  await db.query("delete from public.shared_group_members where group_id=$1::uuid", [contextCircleId]);
  const share = await db.query("select public.plan_share_create_v1($1::uuid,$2::uuid,null::timestamptz) payload", [ids.alex, planId]);
  const preview = await db.query("select public.plan_public_preview_v1($1) payload", [share.rows[0].payload.token]);
  await db.query("select public.plan_share_revoke_v1($1::uuid,$2::uuid)", [ids.alex, planId]);
  const revoked = await db.query("select public.plan_public_preview_v1($1) payload", [share.rows[0].payload.token]);
  const left = await db.query("select public.plan_leave_v1($1::uuid,$2::uuid) payload", [ids.blair, planId]);
  assert(preview.rows[0].payload.plan.id === planId && revoked.rows[0].payload.error === "NOT_FOUND", "revoked shares must stop resolving");
  assert(left.rows[0].payload.left === true, "non-owner members must be able to leave Plans");

  const nearbyPlan = await db.query("select public.plan_create_v2($1::uuid,'walk',null::text,now()+interval '2 hours','Park','open',null::uuid,4::smallint,null::uuid,'nearby-plan-create',repeat('f',64),true) payload", [ids.alex]);
  assert(nearbyPlan.rows[0].payload.plan.id, "explicit nearby discovery must create a Plan with a fresh location");
  const nearList = await db.query("select public.plans_list_v2($1::uuid) payload", [ids.blair]);
  const farList = await db.query("select public.plans_list_v2($1::uuid) payload", [ids.casey]);
  assert(nearList.rows[0].payload.plans.some((item) => item.id === nearbyPlan.rows[0].payload.plan.id), "nearby open Plans must be discoverable in the viewer's coarse area");
  assert(!farList.rows[0].payload.plans.some((item) => item.id === nearbyPlan.rows[0].payload.plan.id), "open Plans must not be globally discoverable outside the coarse area");

  await db.query("update public.user_locations set updated_at=now()-interval '11 minutes' where user_id in ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  await db.query("update public.user_locations set updated_at=now() where user_id=$1::uuid", [ids.casey]);
  const firstLocationPurge = await db.query("select public.purge_stale_user_locations(1) deleted");
  const secondLocationPurge = await db.query("select public.purge_stale_user_locations(1001) deleted");
  const thirdLocationPurge = await db.query("select public.purge_stale_user_locations(1000) deleted");
  const freshLocation = await db.query("select count(*)::int count from public.user_locations where user_id=$1::uuid", [ids.casey]);
  assert(firstLocationPurge.rows[0].deleted === 1 && secondLocationPurge.rows[0].deleted === 1, "location cleanup must make bounded forward progress");
  assert(thirdLocationPurge.rows[0].deleted === 0, "location cleanup must be idempotent after stale rows are deleted");
  assert(freshLocation.rows[0].count === 1, "location cleanup must preserve fresh coordinates");

  const pastPlanId = (await db.query("select gen_random_uuid() id")).rows[0].id;
  await db.query("insert into public.plans(id,owner_id,activity,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'coffee',now()-interval '1 hour','Cafe','private',2,'active')", [pastPlanId, ids.alex]);
  await db.query("insert into public.plan_members(plan_id,user_id,role) values ($1::uuid,$2::uuid,'owner'),($1::uuid,$3::uuid,'member')", [pastPlanId, ids.alex, ids.blair]);
  const memberRecentPlans = await db.query("select public.plans_list_v2($1::uuid) payload", [ids.alex]);
  const outsiderRecentPlans = await db.query("select public.plans_list_v2($1::uuid) payload", [ids.casey]);
  const expiredRecentPlanId = (await db.query("select gen_random_uuid() id")).rows[0].id;
  await db.query("insert into public.plans(id,owner_id,activity,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'walk',now()-interval '49 hours','Park','private',2,'active')", [expiredRecentPlanId, ids.alex]);
  await db.query("insert into public.plan_members(plan_id,user_id,role) values ($1::uuid,$2::uuid,'owner')", [expiredRecentPlanId, ids.alex]);
  const memberAfterExpiryPlans = await db.query("select public.plans_list_v2($1::uuid) payload", [ids.alex]);
  const lateJoin = await db.query("select public.plan_join_v1($1::uuid,$2::uuid,'plan-late-join-key01',repeat('8',64),null::text) payload", [ids.casey, pastPlanId]);
  const startedPlanUpdate = await db.query("select public.plan_update_v1($1::uuid,$2::uuid,jsonb_build_object('starts_at',pg_catalog.now()+interval '4 hours')) payload", [ids.alex, pastPlanId]);
  const immutableStart = await db.query("select starts_at <= now() preserved from public.plans where id=$1::uuid", [pastPlanId]);
  assert(memberRecentPlans.rows[0].payload.plans.some((item) => item.id === pastPlanId) && !outsiderRecentPlans.rows[0].payload.plans.some((item) => item.id === pastPlanId), "a recent Plan must remain visible only to its current members");
  assert(!memberAfterExpiryPlans.rows[0].payload.plans.some((item) => item.id === expiredRecentPlanId), "member Plans older than forty-eight hours must leave the list");
  assert(lateJoin.rows[0].payload.error === "EXPIRED", "joining must remain denied after a Plan starts");
  assert(startedPlanUpdate.rows[0].payload.error === "EXPIRED" && immutableStart.rows[0].preserved === true, "a started Plan must not be rescheduled by its owner");
  const planMeetupInitial = await db.query("select public.plan_meetup_status_v1($1::uuid,$2::uuid) payload", [ids.alex, pastPlanId]);
  const planMeetupFirst = await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'plan-meetup-key-0001',repeat('1',64)) payload", [ids.alex, pastPlanId, ids.blair]);
  const planMeetupConfirmed = await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'plan-meetup-key-0002',repeat('2',64)) payload", [ids.blair, pastPlanId, ids.alex]);
  const planMeetupReplay = await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'plan-meetup-key-0001',repeat('1',64)) payload", [ids.alex, pastPlanId, ids.blair]);
  assert(planMeetupInitial.rows[0].payload.canConfirm === true && planMeetupInitial.rows[0].payload.acknowledgements.length === 1, "current Plan members must receive a bounded explicit peer confirmation status");
  assert(planMeetupFirst.rows[0].payload.acknowledgements[0].viewerConfirmed === true && planMeetupFirst.rows[0].payload.acknowledgements[0].peerConfirmed === false && planMeetupConfirmed.rows[0].payload.acknowledgements[0].confirmedAt !== null, "Plan attribution must require both participants to confirm");
  assert(JSON.stringify(planMeetupReplay.rows[0].payload) === JSON.stringify(planMeetupFirst.rows[0].payload), "Plan confirmation retries must replay the original DTO without a second mutation");
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [ids.alex, ids.blair]);
  const blockedPlanMeetup = await db.query("select public.plan_meetup_status_v1($1::uuid,$2::uuid) payload", [ids.alex, pastPlanId]);
  assert(blockedPlanMeetup.rows[0].payload.acknowledgements.length === 0 && blockedPlanMeetup.rows[0].payload.canConfirm === false, "blocks must hide Plan confirmation state and prevent future confirmation");
  await db.query("delete from public.user_blocks where blocker_id=$1::uuid and blocked_id=$2::uuid", [ids.alex, ids.blair]);
  await db.query("delete from public.plan_members where plan_id=$1::uuid and user_id=$2::uuid", [pastPlanId, ids.blair]);
  const formerMemberConfirm = await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'plan-meetup-key-0003',repeat('3',64)) payload", [ids.alex, pastPlanId, ids.blair]);
  assert(formerMemberConfirm.rows[0].payload.error === "NOT_FOUND", "leaving a Plan must revoke Plan confirmation authority");
  await db.query("update public.plans set status='cancelled' where id=$1::uuid", [pastPlanId]);
  const cancelledPlanMeetup = await db.query("select public.plan_meetup_status_v1($1::uuid,$2::uuid) payload", [ids.alex, pastPlanId]);
  const retainedPlanAttribution = await db.query("select count(*)::int count from public.plan_meetup_acknowledgements where plan_id=$1::uuid and confirmed_at is not null", [pastPlanId]);
  assert(cancelledPlanMeetup.rows[0].payload.canConfirm === false && cancelledPlanMeetup.rows[0].payload.acknowledgements.length === 0 && retainedPlanAttribution.rows[0].count === 1, "cancelling a Plan must hide further confirmation state without erasing completed attribution");

  const cohortPlanId = (await db.query("select gen_random_uuid() id")).rows[0].id;
  await db.query("insert into public.plans(id,owner_id,activity,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'walk',(date_trunc('day',now() at time zone 'UTC')-interval '1 day') at time zone 'UTC','Park','private',3,'active')", [cohortPlanId, ids.alex]);
  await db.query("insert into public.plan_members(plan_id,user_id,role) values ($1::uuid,$2::uuid,'owner'),($1::uuid,$3::uuid,'member'),($1::uuid,$4::uuid,'member')", [cohortPlanId, ids.alex, ids.blair, ids.casey]);
  await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'cohort-meetup-key-001',repeat('4',64))", [ids.alex, cohortPlanId, ids.blair]);
  await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'cohort-meetup-key-002',repeat('5',64))", [ids.blair, cohortPlanId, ids.alex]);
  await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'cohort-meetup-key-003',repeat('6',64))", [ids.alex, cohortPlanId, ids.casey]);
  await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'cohort-meetup-key-004',repeat('7',64))", [ids.casey, cohortPlanId, ids.alex]);
  await db.query("update public.plans set status='cancelled' where id=$1::uuid", [cohortPlanId]);
  const conversionCohort = await db.query("select * from public.product_plan_conversion_metrics(current_date-1,current_date-1)");
  const emptyConversionCohort = await db.query("select * from public.product_plan_conversion_metrics(current_date-4,current_date-4)");
  assert(conversionCohort.rows[0].scheduled_plans === 1 && conversionCohort.rows[0].mutually_confirmed_plans === 1 && Number(conversionCohort.rows[0].conversion_rate) === 1 && conversionCohort.rows[0].confirmation_window_closed === false, "a next-day mutual confirmation must count one cancelled Plan cohort outcome even with two confirmed participant pairs");
  assert(emptyConversionCohort.rows[0].scheduled_plans === 0 && emptyConversionCohort.rows[0].conversion_rate === null, "empty Plan conversion cohorts must return a null rate");

  await db.query("insert into public.pokes(sender_id,recipient_id,activity,status,expires_at,created_at,responded_at) values ($1::uuid,$2::uuid,'coffee','declined',now()-interval '8 days',now()-interval '8 days',now()-interval '8 days')", [ids.alex, ids.casey]);
  const metrics = await db.query("select * from public.product_daily_funnel_metrics(current_date, current_date)");
  const activationBeforeAvailability = await db.query("select source, activated_at from public.product_first_activations where user_id=$1::uuid", [ids.alex]);
  await db.query("select public.record_product_activation_v1($1::uuid,'availability')", [ids.alex]);
  await db.query("select public.record_product_discovery_v1($1::uuid,2::smallint,4::smallint,9::smallint)", [ids.alex]);
  await db.query("select public.record_product_discovery_v1($1::uuid,1::smallint,3::smallint,12::smallint)", [ids.alex]);
  const privateMetrics = await db.query("select * from public.product_private_activity_metrics(current_date,current_date)");
  const activationAfterAvailability = await db.query("select source, activated_at = $2::timestamptz unchanged from public.product_first_activations where user_id=$1::uuid", [ids.alex, activationBeforeAvailability.rows[0].activated_at]);
  assert(activationBeforeAvailability.rows[0].source === 'poke' && activationAfterAvailability.rows[0].unchanged === true, "Poke trigger must retain the original first activation when availability changes");
  assert(privateMetrics.rows[0].first_activations === 1 && privateMetrics.rows[0].opportunities_2km === 2 && privateMetrics.rows[0].opportunities_10km === 4 && privateMetrics.rows[0].opportunities_25km === 12 && privateMetrics.rows[0].plan_confirmation_started_pairs === 3 && privateMetrics.rows[0].plan_to_mutual_confirmed === 3 && privateMetrics.rows[0].plan_conversion_attribution_available === true, "private activity metrics must retain first activation, daily maxima, and explicit Plan confirmation event counts");
  await db.query("insert into public.product_activity_days(user_id,activity_day,kind) values($1::uuid,current_date-32,'discovery')", [ids.casey]);
  await db.query("select public.purge_product_daily_activity_v1(31)");
  const expiredActivity = await db.query("select count(*)::int count from public.product_activity_days where activity_day < current_date-31");
  const retainedFirstActivation = await db.query("select count(*)::int count from public.product_first_activations where user_id=$1::uuid", [ids.alex]);
  assert(expiredActivity.rows[0].count === 0 && retainedFirstActivation.rows[0].count === 1, "daily activity cleanup must be bounded without deleting first activation cohorts");
  let rangeWasRejected = false;
  try { await db.query("select * from public.product_private_activity_metrics(current_date-31,current_date)"); } catch { rangeWasRejected = true; }
  assert(rangeWasRejected, "private activity metric queries must reject ranges over thirty-one days");
  const privateMetricsRoleGate = await db.query("select has_function_privilege('authenticated', 'public.product_private_activity_metrics(date, date)', 'EXECUTE') app_read, has_function_privilege('service_role', 'public.product_private_activity_metrics(date, date)', 'EXECUTE') service_read");
  assert(privateMetricsRoleGate.rows[0].app_read === false && privateMetricsRoleGate.rows[0].service_read === true, "private activity metrics must be service-only");
  const conversionMetricsRoleGate = await db.query("select has_function_privilege('authenticated', 'public.product_plan_conversion_metrics(date, date)', 'EXECUTE') app_read, has_function_privilege('service_role', 'public.product_plan_conversion_metrics(date, date)', 'EXECUTE') service_read");
  assert(conversionMetricsRoleGate.rows[0].app_read === false && conversionMetricsRoleGate.rows[0].service_read === true, "Plan conversion cohorts must be service-only");
  const metric = metrics.rows[0];
  assert(metric.activated_users >= 1 && metric.pokes_sent >= 1 && metric.pokes_accepted >= 1, "funnel metrics must count activation and Poke outcomes without payloads");
  assert(metric.plans_created >= 1 && metric.plan_joins >= 1 && metric.mutual_meetups >= 1, "funnel metrics must count Plans, joins, and mutual meetups");
  const weeklyMetrics = await db.query("select * from public.product_weekly_social_activity_metrics(current_date-14, current_date)");
  assert(weeklyMetrics.rows.at(-1).socially_active_accounts >= 2 && weeklyMetrics.rows.at(-1).repeat_week_socially_active_accounts >= 1, "weekly social activity must count durable repeat social actors, not readers");
  const metricsRoleGate = await db.query("select has_function_privilege('authenticated', 'public.product_daily_funnel_metrics(date, date)', 'EXECUTE') app_read, has_function_privilege('service_role', 'public.product_daily_funnel_metrics(date, date)', 'EXECUTE') service_read, has_function_privilege('authenticated', 'public.product_weekly_social_activity_metrics(date, date)', 'EXECUTE') app_weekly_read, has_function_privilege('service_role', 'public.product_weekly_social_activity_metrics(date, date)', 'EXECUTE') service_weekly_read");
  assert(metricsRoleGate.rows[0].app_read === false && metricsRoleGate.rows[0].service_read === true && metricsRoleGate.rows[0].app_weekly_read === false && metricsRoleGate.rows[0].service_weekly_read === true, "product metrics must be service-only");

  await db.exec(await sql("supabase/migrations/20260908134739_account_age_admission.sql"));
  const pendingAdmission = await db.query("select public.read_account_age_admission_v1($1::uuid) payload", [ids.alex]);
  const adultAdmission = await db.query("select public.record_account_age_admission_v1($1::uuid,true) payload", [ids.alex]);
  const immutableAdmission = await db.query("select public.record_account_age_admission_v1($1::uuid,false) payload", [ids.alex]);
  const blockedAdmission = await db.query("select public.record_account_age_admission_v1($1::uuid,false) payload", [ids.blair]);
  let pendingDenied = false;
  let blockedDenied = false;
  try { await db.query("select public.require_adult_social_admission_v1($1::uuid)", [ids.casey]); } catch (error) { pendingDenied = error?.message?.includes("AGE_ADMISSION_REQUIRED"); }
  try { await db.query("select public.require_adult_social_admission_v1($1::uuid)", [ids.blair]); } catch (error) { blockedDenied = error?.message?.includes("AGE_NOT_ELIGIBLE"); }
  await db.query("select public.require_adult_social_admission_v1($1::uuid)", [ids.alex]);
  const admissionRoleGate = await db.query("select has_table_privilege('authenticated','public.account_age_admissions','select') table_read, has_function_privilege('authenticated','public.read_account_age_admission_v1(uuid)','execute') app_read, has_function_privilege('service_role','public.read_account_age_admission_v1(uuid)','execute') service_read");
  assert(pendingAdmission.rows[0].payload.status === 'pending' && pendingAdmission.rows[0].payload.decided_at === null && adultAdmission.rows[0].payload.status === 'adult' && immutableAdmission.rows[0].payload.status === 'adult' && blockedAdmission.rows[0].payload.status === 'blocked', "age admission must default to pending and keep its first self-declaration immutable");
  assert(pendingDenied && blockedDenied && admissionRoleGate.rows[0].table_read === false && admissionRoleGate.rows[0].app_read === false && admissionRoleGate.rows[0].service_read === true, "age admission must deny pending and blocked social actors while remaining service-only");

  // Exercise the assembled product RPC replacements after the adult decision.
  // Casey stays pending and Blair stays blocked to verify actor and peer gates.
  // Dana and Erin are deliberately tombstoned by the preceding erasure tests.
  // Use newly-created accounts so this verifies age gates without weakening that coverage.
  const adultA = "66666666-6666-4666-8666-666666666666";
  const adultB = "77777777-7777-4777-8777-777777777777";
  await db.query("insert into public.profiles(id,username,display_name) values ($1::uuid,'frank','Frank'),($2::uuid,'grace','Grace')", [adultA, adultB]);
  await db.query("select public.record_account_age_admission_v1($1::uuid,true)", [adultA]);
  await db.query("select public.record_account_age_admission_v1($1::uuid,true)", [adultB]);
  const adultAvailability = await db.query("select public.upsert_user_availability($1::uuid,'coffee',null,30) payload", [adultA]);
  const adultPoke = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Age-gated hello','age-poke-happy-0001') payload", [adultA, adultB]);
  const adultInbox = await db.query("select public.get_active_pokes($1::uuid,20) payload", [adultB]);
  const acceptedPoke = await db.query("select public.respond_to_poke($1::uuid,$2::uuid,'accept','age-poke-accept-001') payload", [adultB, adultPoke.rows[0].payload.poke.id]);
  const adultPlan = await db.query("select public.plan_create_v2($1::uuid,'Coffee','Age verified plan',now()+interval '2 hours','Public cafe','private',null::uuid,2::smallint,null::uuid,'age-plan-happy-0001',repeat('a',64),false) payload", [adultA]);
  const adultPlans = await db.query("select public.plans_list_v2($1::uuid) payload", [adultA]);
  const blockedMeetupPlanId = "88888888-8888-4888-8888-888888888888";
  await db.query("insert into public.plans(id,owner_id,activity,title,starts_at,place_text,visibility,participant_limit,status) values ($1::uuid,$2::uuid,'coffee','Blocked meetup status',now()-interval '1 hour','Public cafe','private',2,'active')", [blockedMeetupPlanId, adultA]);
  await db.query("insert into public.plan_members(plan_id,user_id,role) values ($1::uuid,$2::uuid,'owner'),($1::uuid,$3::uuid,'member')", [blockedMeetupPlanId, adultA, adultB]);
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid)", [adultA, adultB]);
  const blockedMeetupBeforeCorrection = await db.query("select public.plan_meetup_status_v1($1::uuid,$2::uuid) payload", [adultA, blockedMeetupPlanId]);
  await db.exec(await sql("supabase/migrations/20260908135910_adult_social_runtime_corrections.sql"));
  const retiredChatRoleGate = await db.query("select has_function_privilege('authenticated','public.get_chat_room_summary(uuid)','execute') summary, has_function_privilege('authenticated','public.get_chat_room_unread_count()','execute') unread, has_function_privilege('authenticated','public.list_chat_room_summaries(integer,timestamp with time zone,uuid)','execute') list");
  const blockedMeetupAfterCorrection = await db.query("select public.plan_meetup_status_v1($1::uuid,$2::uuid) payload", [adultA, blockedMeetupPlanId]);
  const blockedMeetupConfirmation = await db.query("select public.plan_meetup_acknowledge_v1($1::uuid,$2::uuid,$3::uuid,'blocked-meetup-ack-0001',repeat('b',64)) payload", [adultA, blockedMeetupPlanId, adultB]);
  const blockedMeetupRows = await db.query("select count(*)::int count from public.plan_meetup_acknowledgements where plan_id=$1::uuid", [blockedMeetupPlanId]);
  let pendingAvailabilityDenied = false;
  let blockedPokesDenied = false;
  try { await db.query("select public.upsert_user_availability($1::uuid,'coffee',null,30)", [ids.casey]); } catch (error) { pendingAvailabilityDenied = error?.message?.includes("AGE_ADMISSION_REQUIRED"); }
  try { await db.query("select public.get_active_pokes($1::uuid,20)", [ids.blair]); } catch (error) { blockedPokesDenied = error?.message?.includes("AGE_NOT_ELIGIBLE"); }
  const pendingPeerPoke = await db.query("select public.create_poke($1::uuid,$2::uuid,'coffee',null,'Must not persist','age-poke-pending-01') payload", [adultA, ids.casey]);
  const pendingPeerRows = await db.query("select count(*)::int count from public.pokes where sender_id=$1::uuid and recipient_id=$2::uuid and note='Must not persist'", [adultA, ids.casey]);
  assert(adultAvailability.rows[0].payload.availability?.userId === adultA && adultInbox.rows[0].payload.received.length === 1 && acceptedPoke.rows[0].payload.threadId && adultPlan.rows[0].payload.plan?.id && adultPlans.rows[0].payload.plans.some((plan) => plan.id === adultPlan.rows[0].payload.plan.id), "adult admission must preserve availability, Poke acceptance into a DM, and Plan creation/listing");
  assert(pendingAvailabilityDenied && blockedPokesDenied && pendingPeerPoke.rows[0].payload.error === "BLOCKED" && pendingPeerRows.rows[0].count === 0, "pending or blocked actors and pending peers must be denied before social writes");
  assert(retiredChatRoleGate.rows[0].summary === false && retiredChatRoleGate.rows[0].unread === false && retiredChatRoleGate.rows[0].list === false, "runtime corrections must revoke retired chat-room RPCs from authenticated clients");
  assert(blockedMeetupBeforeCorrection.rows[0].payload.error === "NOT_FOUND" && Array.isArray(blockedMeetupAfterCorrection.rows[0].payload.acknowledgements) && blockedMeetupAfterCorrection.rows[0].payload.acknowledgements.length === 0 && blockedMeetupAfterCorrection.rows[0].payload.canConfirm === false && blockedMeetupConfirmation.rows[0].payload.error === "NOT_FOUND" && blockedMeetupRows.rows[0].count === 0, "a Plan owner must retain an empty meetup-management view after blocking a member while confirmations remain denied");

  const v1DiscoveryDefinitionBeforeV2 = (await db.query("select pg_get_functiondef('public.get_available_people(uuid,integer,integer)'::regprocedure) definition")).rows[0].definition;
  await db.exec(await sql("supabase/migrations/20260908174342_discovery_context_ranking_v2.sql"));
  const v1DiscoveryDefinitionAfterV2 = (await db.query("select pg_get_functiondef('public.get_available_people(uuid,integer,integer)'::regprocedure) definition")).rows[0].definition;
  assert(v1DiscoveryDefinitionAfterV2 === v1DiscoveryDefinitionBeforeV2, "v2 must not alter the legacy v1 discovery function definition");
  const discoveryIds = {
    viewer: "90000000-0000-4000-8000-000000000001",
    friend: "90000000-0000-4000-8000-000000000002",
    strong: "90000000-0000-4000-8000-000000000003",
    mutualCandidate: "90000000-0000-4000-8000-000000000004",
    invalidMutualCandidate: "90000000-0000-4000-8000-000000000005",
    mutual: "90000000-0000-4000-8000-000000000006",
    blockedMutual: "90000000-0000-4000-8000-000000000007",
    deletedMutual: "90000000-0000-4000-8000-000000000008",
    pendingMutual: "90000000-0000-4000-8000-000000000009",
    hiddenMutual: "90000000-0000-4000-8000-000000000010",
    blockedCandidate: "90000000-0000-4000-8000-000000000011",
    hiddenCandidate: "90000000-0000-4000-8000-000000000012",
    deletedCandidate: "90000000-0000-4000-8000-000000000013",
    pendingCandidate: "90000000-0000-4000-8000-000000000014",
    staleCandidate: "90000000-0000-4000-8000-000000000015",
    recent: "90000000-0000-4000-8000-000000000016",
    old: "90000000-0000-4000-8000-000000000017",
    shared: "90000000-0000-4000-8000-000000000018",
    tieLow: "90000000-0000-4000-8000-000000000019",
    tieHigh: "90000000-0000-4000-8000-000000000020",
  };
  const ordinaryCandidates = Array.from({ length: 25 }, (_, index) => `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const discoveryProfiles = [...new Set([...Object.values(discoveryIds), ...ordinaryCandidates])];
  for (const [index, userId] of discoveryProfiles.entries()) {
    await db.query("insert into public.profiles(id,username,display_name) values ($1::uuid,$2,$3)", [userId, `discovery-${index}`, `Discovery ${index}`]);
  }
  const pendingDiscoveryAccounts = new Set([discoveryIds.pendingMutual, discoveryIds.pendingCandidate]);
  for (const userId of discoveryProfiles) {
    if (!pendingDiscoveryAccounts.has(userId)) {
      await db.query("select public.record_account_age_admission_v1($1::uuid,true)", [userId]);
    }
  }
  for (const userId of discoveryProfiles) {
    if (pendingDiscoveryAccounts.has(userId)) {
      await db.query("insert into public.user_availabilities(user_id,activity,expires_at) values ($1::uuid,'coffee',now()+interval '1 hour')", [userId]);
    } else {
      await db.query("select public.upsert_user_availability($1::uuid,'coffee',null,60)", [userId]);
    }
    await db.query("insert into public.user_locations(user_id,lat,lng,updated_at) values ($1::uuid,42.6977,23.3219,now())", [userId]);
  }
  await db.query("update public.user_availabilities set expires_at=date_trunc('second',now())+interval '1 hour', updated_at=date_trunc('second',now()) where user_id = any($1::uuid[])", [discoveryProfiles]);
  await db.query("update public.user_availabilities set updated_at=now()-interval '16 minutes' where user_id=$1::uuid", [discoveryIds.old]);
  await db.query("update public.user_locations set updated_at=now()-interval '11 minutes' where user_id=$1::uuid", [discoveryIds.staleCandidate]);
  await db.query("update public.user_locations set lat=42.69 where user_id=$1::uuid", [discoveryIds.tieLow]);

  const acceptFriendship = async (requesterId, addresseeId) => {
    await db.query("insert into public.friendships(requester_id,addressee_id,status,responded_at) values ($1::uuid,$2::uuid,'accepted',now())", [requesterId, addresseeId]);
  };
  await acceptFriendship(discoveryIds.viewer, discoveryIds.friend);
  await acceptFriendship(discoveryIds.viewer, discoveryIds.mutual);
  await acceptFriendship(discoveryIds.mutualCandidate, discoveryIds.mutual);
  for (const intermediary of [discoveryIds.blockedMutual, discoveryIds.deletedMutual, discoveryIds.pendingMutual, discoveryIds.hiddenMutual]) {
    await acceptFriendship(discoveryIds.viewer, intermediary);
    await acceptFriendship(discoveryIds.invalidMutualCandidate, intermediary);
  }
  await db.query("insert into public.user_blocks(blocker_id,blocked_id) values ($1::uuid,$2::uuid),($1::uuid,$3::uuid)", [discoveryIds.viewer, discoveryIds.blockedMutual, discoveryIds.blockedCandidate]);
  await db.query("select public.update_discovery_preference($1::uuid,'hidden'::public.discovery_audience)", [discoveryIds.hiddenMutual]);
  await db.query("select public.update_discovery_preference($1::uuid,'hidden'::public.discovery_audience)", [discoveryIds.hiddenCandidate]);
  await db.query("update public.profiles set deleted_at=now() where id in ($1::uuid,$2::uuid)", [discoveryIds.deletedMutual, discoveryIds.deletedCandidate]);

  const discoveryInterestId = "90000000-0000-4000-8000-000000000099";
  await db.query("insert into public.interest_tags(id,name) values ($1::uuid,'Discovery coffee')", [discoveryInterestId]);
  await db.query("insert into public.profile_interests(user_id,tag_id) values ($1::uuid,$4::uuid),($2::uuid,$4::uuid),($3::uuid,$4::uuid)", [discoveryIds.viewer, discoveryIds.shared, discoveryIds.tieLow, discoveryInterestId]);
  await db.query("insert into public.profile_interests(user_id,tag_id) values ($1::uuid,$2::uuid)", [discoveryIds.tieHigh, discoveryInterestId]);
  const discoveryThreadId = "90000000-0000-4000-8000-000000000098";
  await db.query("insert into public.dm_threads(id,participant_1_id,participant_2_id) values ($1::uuid,$2::uuid,$3::uuid)", [discoveryThreadId, discoveryIds.viewer, discoveryIds.strong]);
  await db.query("insert into public.pokes(sender_id,recipient_id,activity,status,expires_at,responded_at,thread_id) values ($1::uuid,$2::uuid,'coffee','accepted',now()+interval '1 hour',now(),$3::uuid)", [discoveryIds.viewer, discoveryIds.strong, discoveryThreadId]);
  await db.query("insert into public.meetup_acknowledgements(user_a_id,user_b_id,meetup_day,user_a_confirmed_at,user_b_confirmed_at,confirmed_at,expires_at) values ($1::uuid,$2::uuid,current_date,now(),now(),now(),now()+interval '1 day')", [discoveryIds.viewer, discoveryIds.strong]);

  const discoveryV2 = await db.query("select public.get_available_people_v2($1::uuid,100,25) payload", [discoveryIds.viewer]);
  const discoveryPeople = discoveryV2.rows[0].payload.people;
  const discoveryById = new Map(discoveryPeople.map((person) => [person.profile.id, person]));
  const discoveryPosition = (userId) => discoveryPeople.findIndex((person) => person.profile.id === userId);
  const expectedReasons = new Set(["intent_match", "nearby_friend", "shared_interests", "mutual_friends", "connected_before", "mutual_meetup"]);
  assert(ordinaryCandidates.length > 20 && discoveryPeople.length > 20, "v2 fixture must include more than the old twenty-candidate pre-limit window");
  for (const userId of [discoveryIds.blockedCandidate, discoveryIds.hiddenCandidate, discoveryIds.deletedCandidate, discoveryIds.pendingCandidate, discoveryIds.staleCandidate]) {
    assert(!discoveryById.has(userId), "v2 must filter blocked, hidden, deleted, pending, and stale candidates before ranking and limit");
  }
  for (const person of discoveryPeople) {
    assert(Array.isArray(person.discoveryReasons) && person.discoveryReasons.length <= 3 && person.discoveryReasons.every((reason) => expectedReasons.has(reason)), "v2 reasons must be a bounded allowlist");
  }
  assert(JSON.stringify(discoveryById.get(discoveryIds.strong).discoveryReasons) === JSON.stringify(["intent_match", "mutual_meetup", "connected_before"]), "v2 must order direct mutual-meetup and accepted-Poke context before lower-priority reasons");
  assert(JSON.stringify(discoveryById.get(discoveryIds.friend).discoveryReasons) === JSON.stringify(["intent_match", "nearby_friend"]), "v2 must explain a direct friendship without exposing counts");
  assert(JSON.stringify(discoveryById.get(discoveryIds.mutualCandidate).discoveryReasons) === JSON.stringify(["intent_match", "mutual_friends"]), "v2 must include only a valid mutual connection");
  assert(!discoveryById.get(discoveryIds.invalidMutualCandidate).discoveryReasons.includes("mutual_friends"), "blocked, deleted, pending, or hidden intermediaries must not create a mutual-friends reason");
  assert(JSON.stringify(discoveryById.get(discoveryIds.shared).discoveryReasons) === JSON.stringify(["intent_match", "shared_interests"]), "v2 must explain shared interests without leaking the count");
  assert(discoveryPosition(discoveryIds.friend) < discoveryPosition(discoveryIds.strong) && discoveryPosition(discoveryIds.strong) < discoveryPosition(discoveryIds.mutualCandidate) && discoveryPosition(discoveryIds.mutualCandidate) < discoveryPosition(discoveryIds.shared), "v2 must rank direct friendship, direct prior interaction, mutual connection, and shared interests in order");
  assert(discoveryPosition(discoveryIds.recent) < discoveryPosition(discoveryIds.old) && discoveryPosition(discoveryIds.tieLow) < discoveryPosition(discoveryIds.tieHigh), "v2 must use the fifteen-minute recency bucket and stable UUID tie-breaker");
  assert(discoveryById.get(discoveryIds.tieLow).distanceKm === 2 && discoveryById.get(discoveryIds.tieHigh).distanceKm === 2, "v2 must present equal coarse two-kilometre buckets for nearby candidates");
  const coarseBucketLimit = await db.query("select public.get_available_people_v2($1::uuid,6,25) payload", [discoveryIds.viewer]);
  assert(coarseBucketLimit.rows[0].payload.people.at(-1).profile.id === discoveryIds.tieLow && !coarseBucketLimit.rows[0].payload.people.some((person) => person.profile.id === discoveryIds.tieHigh), "the inner limit must use the same coarse distance bucket and UUID tie-breaker as the response ordering");
  const discoveryTopOne = await db.query("select public.get_available_people_v2($1::uuid,1,25) payload", [discoveryIds.viewer]);
  assert(discoveryTopOne.rows[0].payload.people[0].profile.id === discoveryIds.friend, "v2 must rank the complete eligible set before applying the limit, rather than preserving an old top-twenty bias");
  const discoveryV1 = await db.query("select public.get_available_people($1::uuid,100,25) payload", [discoveryIds.viewer]);
  assert(discoveryV1.rows[0].payload.people.every((person) => !Object.hasOwn(person, "discoveryReasons")), "the unchanged v1 discovery RPC must retain its legacy response shape");
  const strongPayload = JSON.stringify(discoveryById.get(discoveryIds.strong));
  assert(!strongPayload.includes(discoveryIds.mutual) && !strongPayload.includes("confirmed_at") && !strongPayload.includes("responded_at") && !strongPayload.includes("mutual_friend_count") && !strongPayload.includes("latitude") && !strongPayload.includes("longitude"), "v2 must not leak intermediary identities, history dates or counts, or precise locations");
  assert(Object.keys(discoveryV2.rows[0].payload).sort().join(",") === "availability,people", "v2 must keep the top-level discovery DTO minimal");
  const discoveryV2RoleGate = await db.query("select has_function_privilege('public','public.get_available_people_v2(uuid,integer,integer)','execute') public_read, has_function_privilege('anon','public.get_available_people_v2(uuid,integer,integer)','execute') anon_read, has_function_privilege('authenticated','public.get_available_people_v2(uuid,integer,integer)','execute') authenticated_read, has_function_privilege('service_role','public.get_available_people_v2(uuid,integer,integer)','execute') service_read");
  assert(discoveryV2RoleGate.rows[0].public_read === false && discoveryV2RoleGate.rows[0].anon_read === false && discoveryV2RoleGate.rows[0].authenticated_read === false && discoveryV2RoleGate.rows[0].service_read === true, "v2 discovery must be executable only by service_role");
  for (const [limit, radius] of [[null, 25], [100, null]]) {
    let invalidBoundsCode = null;
    try { await db.query("select public.get_available_people_v2($1::uuid,$2::integer,$3::integer)", [discoveryIds.viewer, limit, radius]); } catch (error) { invalidBoundsCode = error?.code; }
    assert(invalidBoundsCode === "22023", "v2 must reject null discovery bounds with SQLSTATE 22023");
  }

  await db.query("update public.profiles set deleted_at=now() where id=$1::uuid", [ids.alex]);
  const tombstonedAdmission = await db.query("select public.read_account_age_admission_v1($1::uuid) payload", [ids.alex]);
  let tombstonedAdmissionWriteRejected = false;
  try { await db.query("select public.record_account_age_admission_v1($1::uuid,true)", [ids.alex]); } catch (error) { tombstonedAdmissionWriteRejected = error?.code === 'P0002'; }
  assert(tombstonedAdmission.rows[0].payload.status === 'pending' && tombstonedAdmissionWriteRejected, "soft account erasure must purge admission and reject a stale declaration write");
  console.log("product database validation passed");
} finally {
  await db.close();
}
