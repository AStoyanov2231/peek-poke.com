import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = new URL("../..", import.meta.url);
const ids = {
  alex: "11111111-1111-4111-8111-111111111111",
  blair: "22222222-2222-4222-8222-222222222222",
  casey: "33333333-3333-4333-8333-333333333333",
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
    create table public.profiles (id uuid primary key, username text not null, display_name text, avatar_url text, location_text text, is_online boolean not null default false, last_seen_at timestamptz, deleted_at timestamptz, onboarding_completed boolean not null default true);
    create table public.user_blocks (id uuid primary key default gen_random_uuid(), blocker_id uuid not null references public.profiles(id), blocked_id uuid not null references public.profiles(id));
    create table public.friendships (id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id), addressee_id uuid not null references public.profiles(id), status text not null, requested_at timestamptz not null default now(), responded_at timestamptz);
    create table public.user_locations (user_id uuid primary key references public.profiles(id), lat double precision not null, lng double precision not null, updated_at timestamptz not null default now());
    create table public.interest_tags (id uuid primary key default gen_random_uuid(), name text not null);
    create table public.profile_interests (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), tag_id uuid not null references public.interest_tags(id));
    create table public.user_coins (user_id uuid primary key references public.profiles(id), balance integer not null default 5, updated_at timestamptz not null default now());
    create table public.coin_transactions (id uuid primary key default gen_random_uuid(), user_id uuid, amount integer, reason text, related_user_id uuid);
    create table public.idempotency_records (actor_id uuid not null, operation text not null, key text not null, request_hash text not null, response_status integer, response_body jsonb, response_retry_after_seconds integer, primary key(actor_id,operation,key));
    create table public.friendship_mutation_rate_limits (actor_id uuid not null, operation text not null, window_started_at timestamptz not null, request_count integer not null, updated_at timestamptz not null, primary key(actor_id,operation));
    create table public.outbox_events (id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_type text not null, aggregate_id text not null, payload jsonb not null, unique(event_type,aggregate_id));
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
  `);
  await db.exec(await sql("supabase/migrations/20260908010000_free_social_graph_and_coarse_nearby.sql"));
  await db.exec(await sql("supabase/migrations/20260908020000_product_social_intent.sql"));
  await db.exec(await sql("supabase/migrations/20260908030000_product_plans.sql"));
  await db.exec(await sql("supabase/migrations/20260908040000_meeting_social_eligibility.sql"));
  await db.exec(await sql("supabase/migrations/20260908050000_mutual_meetup_acknowledgements.sql"));
  await db.exec(await sql("supabase/migrations/20260908060000_privacy_location_retention.sql"));
  await db.exec(await sql("supabase/migrations/20260908070000_discovery_audience_preferences.sql"));
  await db.exec(await sql("supabase/migrations/20260908080000_plan_nearby_discovery.sql"));
  await db.exec(await sql("supabase/migrations/20260908090000_private_product_funnel_metrics.sql"));
  await db.exec(await sql("supabase/migrations/20260908100000_profile_social_context.sql"));
  await db.exec(await sql("supabase/migrations/20260908110000_private_product_activity_metrics.sql"));
  await db.exec(await sql("supabase/migrations/20260908120000_plan_meetup_attribution.sql"));
  await db.exec(await sql("supabase/migrations/20260908130000_plan_recent_member_lifecycle.sql"));
  await db.exec(await sql("supabase/migrations/20260908140000_legacy_sql_special_forms.sql"));

  await db.query("insert into public.profiles(id,username,display_name) values ($1,'alex','Alex'),($2,'blair','Blair'),($3,'casey','Casey')", [ids.alex, ids.blair, ids.casey]);
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
  console.log("product database validation passed");
} finally {
  await db.close();
}
