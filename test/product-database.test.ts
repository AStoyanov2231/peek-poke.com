import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  requireSupabaseIntegrationTarget,
  resolveSupabaseIntegrationTarget,
} from "./support/supabase-integration-target";

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const target = resolveSupabaseIntegrationTarget(process.env, { requireLocalAppUrl: true });
const configured = Boolean(target.configured && url && serviceRoleKey && anonKey && target.appUrl);
if (target.requested && !configured) {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_APP_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Product database integration tests",
  );
}

type TestUser = { id: string; email: string; password: string; client: SupabaseClient };
let service: SupabaseClient;
let users: TestUser[] = [];
let authUserIds: string[] = [];
let planIds: string[] = [];
let pokeIds: string[] = [];
let threadIds: string[] = [];
const callIds: string[] = [];
const runTag = `ppit${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;

function appUrl() {
  if (!target.configured || !target.appUrl) throw new Error("Loopback app target is unavailable");
  return target.appUrl;
}

async function api(user: TestUser, path: string, init: RequestInit = {}) {
  const { data, error } = await user.client.auth.getSession();
  if (error || !data.session) throw error ?? new Error("Synthetic user session is unavailable");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${data.session.access_token}`);
  return fetch(`${appUrl()}${path}`, { ...init, redirect: "manual", headers });
}

async function createSyntheticUser(label: string): Promise<TestUser> {
  const email = `peek-poke-product-it-${runTag}-${label}@test.invalid`;
  const password = `ProductIntegration-${randomUUID()}!`;
  const result = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic user creation failed");
  const id = result.data.user.id;
  // Track the auth identity before any later profile or login setup can fail.
  authUserIds.push(id);
  const username = `it_${runTag.slice(-10)}_${label}`.slice(0, 20);
  const profile = await service.from("profiles").upsert({
    id,
    auth_user_id: id,
    username,
    display_name: `Integration ${label}`,
    onboarding_completed: true,
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;
  const admission = await service.rpc("record_account_age_admission_v1", {
    p_user_id: id,
    p_is_adult: true,
  });
  if (admission.error || admission.data?.status !== "adult")
    throw admission.error ?? new Error("Synthetic user age admission was not recorded as adult");
  const client = createClient(url!, anonKey!);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, email, password, client };
}

async function removeByIds(table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await service.from(table).delete().in(column, ids);
  if (error) throw error;
}

async function expectServerOnlyReadDenied(
  request: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await request;
  expect(error).not.toBeNull();
}

async function cleanUpSyntheticData() {
  const errors: Error[] = [];
  const attempt = async (operation: () => Promise<void>) => {
    try { await operation(); } catch (error) { errors.push(error instanceof Error ? error : new Error(String(error))); }
  };
  const userIds = [...authUserIds];
  if (userIds.length === 0) return;
  const [ownedPlans, sentPokes, receivedPokes, firstThreads, secondThreads] = await Promise.all([
    service.from("plans").select("id").in("owner_id", userIds),
    service.from("pokes").select("id,thread_id").in("sender_id", userIds),
    service.from("pokes").select("id,thread_id").in("recipient_id", userIds),
    service.from("dm_threads").select("id").in("participant_1_id", userIds),
    service.from("dm_threads").select("id").in("participant_2_id", userIds),
  ]);
  for (const result of [ownedPlans, sentPokes, receivedPokes, firstThreads, secondThreads]) {
    if (result.error) errors.push(result.error);
  }
  const scopedPlanIds = [...new Set([...planIds, ...(ownedPlans.data ?? []).map((row) => row.id)])];
  const scopedPokes = [...(sentPokes.data ?? []), ...(receivedPokes.data ?? [])];
  const scopedPokeIds = [...new Set([...pokeIds, ...scopedPokes.map((row) => row.id)])];
  const scopedThreadIds = [...new Set([
    ...threadIds,
    ...scopedPokes.map((row) => row.thread_id).filter((id): id is string => Boolean(id)),
    ...(firstThreads.data ?? []).map((row) => row.id),
    ...(secondThreads.data ?? []).map((row) => row.id),
  ])];
  const aggregateIds = [...new Set([...scopedPlanIds, ...scopedPokeIds, ...scopedThreadIds, ...callIds])];

  await attempt(() => removeByIds("outbox_events", "aggregate_id", aggregateIds));
  await attempt(() => removeByIds("user_blocks", "blocker_id", userIds));
  await attempt(() => removeByIds("user_blocks", "blocked_id", userIds));
  await attempt(() => removeByIds("plan_meetup_acknowledgements", "plan_id", scopedPlanIds));
  await attempt(() => removeByIds("plan_share_tokens", "plan_id", scopedPlanIds));
  await attempt(() => removeByIds("plan_members", "plan_id", scopedPlanIds));
  await attempt(() => removeByIds("plans", "id", scopedPlanIds));
  await attempt(() => removeByIds("pokes", "id", scopedPokeIds));
  await attempt(() => removeByIds("call_signal_commands", "call_id", callIds));
  await attempt(() => removeByIds("call_sessions", "id", callIds));
  await attempt(() => removeByIds("dm_messages", "thread_id", scopedThreadIds));
  await attempt(() => removeByIds("dm_thread_members", "thread_id", scopedThreadIds));
  await attempt(() => removeByIds("dm_threads", "id", scopedThreadIds));
  await attempt(() => removeByIds("user_availabilities", "user_id", userIds));
  await attempt(() => removeByIds("user_locations", "user_id", userIds));
  await attempt(() => removeByIds("profile_interests", "user_id", userIds));
  await attempt(() => removeByIds("friendships", "requester_id", userIds));
  await attempt(() => removeByIds("friendships", "addressee_id", userIds));
  await attempt(() => removeByIds("plan_join_idempotency", "actor_id", userIds));
  await attempt(() => removeByIds("plan_create_idempotency", "actor_id", userIds));
  await attempt(() => removeByIds("social_idempotency_records", "actor_id", userIds));
  await attempt(() => removeByIds("idempotency_records", "actor_id", userIds));
  await attempt(() => removeByIds("product_first_activations", "user_id", userIds));
  await attempt(() => removeByIds("product_activity_days", "user_id", userIds));
  await attempt(() => removeByIds("product_discovery_daily_activity", "user_id", userIds));
  await attempt(() => removeByIds("coin_transactions", "user_id", userIds));
  await attempt(() => removeByIds("user_coins", "user_id", userIds));
  await attempt(() => removeByIds("profiles", "id", userIds));
  for (const userId of userIds) {
    await attempt(async () => {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  }
  if (errors.length > 0) throw new AggregateError(errors, "Synthetic integration cleanup failed");
}

describe.skipIf(!configured)("product social and Plans hosted integration", () => {
  beforeAll(async () => {
    requireSupabaseIntegrationTarget(
      target,
      process.env,
      ["SUPABASE_TEST_URL", "SUPABASE_TEST_APP_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
      "Product database integration tests",
    );
    service = createClient(url!, serviceRoleKey!);
    for (const label of ["a", "b", "c"]) users.push(await createSyntheticUser(label));
  }, 30_000);

  afterAll(async () => {
    if (!service || authUserIds.length === 0) return;
    await cleanUpSyntheticData();
  }, 30_000);

  it("keeps Pokes, Plans, and explicit Plan meetup confirmation transactional across the real API and database", async () => {
    const [alice, bob, casey] = users;
    const coinsBefore = await service.from("coin_transactions").select("id").in("user_id", [alice.id, bob.id]);
    expect(coinsBefore.error).toBeNull();

    const freshLocationAt = new Date().toISOString();
    const discoveryLocations = await service.from("user_locations").upsert([
      { user_id: alice.id, lat: 42.6977, lng: 23.3219, updated_at: freshLocationAt },
      { user_id: bob.id, lat: 42.6981, lng: 23.3223, updated_at: freshLocationAt },
    ], { onConflict: "user_id" });
    expect(discoveryLocations.error).toBeNull();
    const [aliceAvailability, bobAvailability] = await Promise.all([
      api(alice, "/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "coffee", customLabel: null, durationMinutes: 60 }),
      }),
      api(bob, "/api/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "coffee", customLabel: null, durationMinutes: 60 }),
      }),
    ]);
    expect(aliceAvailability.status).toBe(200);
    expect(bobAvailability.status).toBe(200);

    type DiscoveryPerson = {
      profile: { id: string };
      discoveryReasons?: string[];
    };
    type DiscoveryResponse = { people: DiscoveryPerson[] };
    const v1BeforePoke = await api(alice, "/api/availability?radiusKm=2");
    expect(v1BeforePoke.status).toBe(200);
    const v1BeforePayload = await v1BeforePoke.json() as DiscoveryResponse;
    const v1Bob = v1BeforePayload.people.find((person) => person.profile.id === bob.id);
    expect(v1Bob).toBeDefined();
    expect(v1Bob).not.toHaveProperty("discoveryReasons");

    const v2BeforePoke = await api(alice, "/api/availability?radiusKm=2&discovery_context=1");
    expect(v2BeforePoke.status).toBe(200);
    const v2BeforePayload = await v2BeforePoke.json() as DiscoveryResponse;
    const v2BobBefore = v2BeforePayload.people.find((person) => person.profile.id === bob.id);
    expect(v2BobBefore?.discoveryReasons).toEqual(expect.arrayContaining(["intent_match"]));
    expect(Array.isArray(v2BobBefore?.discoveryReasons)).toBe(true);
    expect(v2BobBefore?.discoveryReasons?.length).toBeLessThanOrEqual(3);
    const directV2Discovery = await alice.client.rpc("get_available_people_v2", {
      p_viewer_id: alice.id,
      p_limit: 20,
      p_radius_km: 2,
    });
    expect(directV2Discovery.error).not.toBeNull();

    const pokeResponse = await api(alice, "/api/pokes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-poke-create-0001" },
      body: JSON.stringify({ recipientId: bob.id, activity: "coffee", customLabel: null, note: "Integration coffee?" }),
    });
    expect(pokeResponse.status).toBe(200);
    const poke = await pokeResponse.json();
    pokeIds.push(poke.poke.id);

    const acceptKey = "product-it-poke-accept-0001";
    const [firstAccept, replayAccept] = await Promise.all([
      api(bob, `/api/pokes/${poke.poke.id}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": acceptKey }, body: JSON.stringify({ action: "accept" }) }),
      api(bob, `/api/pokes/${poke.poke.id}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": acceptKey }, body: JSON.stringify({ action: "accept" }) }),
    ]);
    expect(firstAccept.status).toBe(200);
    expect(replayAccept.status).toBe(200);
    const [firstAccepted, replayedAccepted] = await Promise.all([firstAccept.json(), replayAccept.json()]);
    expect(firstAccepted.threadId).toBe(replayedAccepted.threadId);
    threadIds.push(firstAccepted.threadId);
    const thread = await service.from("dm_threads").select("id", { count: "exact" }).eq("id", firstAccepted.threadId);
    expect(thread.error).toBeNull();
    expect(thread.count).toBe(1);
    const coinsAfter = await service.from("coin_transactions").select("id").in("user_id", [alice.id, bob.id]);
    expect(coinsAfter.error).toBeNull();
    expect(coinsAfter.data).toHaveLength(coinsBefore.data?.length ?? 0);

    const v2AfterAcceptedPoke = await api(alice, "/api/availability?radiusKm=2&discovery_context=1");
    expect(v2AfterAcceptedPoke.status).toBe(200);
    const v2AfterAcceptedPayload = await v2AfterAcceptedPoke.json() as DiscoveryResponse;
    const v2BobAfter = v2AfterAcceptedPayload.people.find((person) => person.profile.id === bob.id);
    expect(v2BobAfter?.discoveryReasons).toEqual(expect.arrayContaining(["connected_before"]));

    const staleBobLocation = await service.from("user_locations")
      .update({ updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() })
      .eq("user_id", bob.id);
    expect(staleBobLocation.error).toBeNull();
    const v2AfterStaleLocation = await api(alice, "/api/availability?radiusKm=2&discovery_context=1");
    expect(v2AfterStaleLocation.status).toBe(200);
    expect((await v2AfterStaleLocation.json() as DiscoveryResponse).people.some((person) => person.profile.id === bob.id)).toBe(false);
    const restoredBobLocation = await service.from("user_locations")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", bob.id);
    expect(restoredBobLocation.error).toBeNull();

    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const capacityPlanResponse = await api(alice, "/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-create-0001" },
      body: JSON.stringify({ activity: "coffee", starts_at: startsAt, place_text: "Integration Cafe", visibility: "open", participant_limit: 2 }),
    });
    expect(capacityPlanResponse.status).toBe(201);
    const capacityPlan = await capacityPlanResponse.json();
    planIds.push(capacityPlan.plan.id);
    const joinAttempts = await Promise.all([
      api(bob, `/api/plans/${capacityPlan.plan.id}/join`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-join-b-001" }, body: "{}" }),
      api(casey, `/api/plans/${capacityPlan.plan.id}/join`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-join-c-001" }, body: "{}" }),
    ]);
    const joinStatuses = joinAttempts.map((response) => response.status).sort();
    expect(joinStatuses).toEqual([200, 409]);
    const winningIndex = joinAttempts.findIndex((response) => response.status === 200);
    const winningUser = [bob, casey][winningIndex];
    const winningRetry = await api(winningUser, `/api/plans/${capacityPlan.plan.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": winningIndex === 0 ? "product-it-plan-join-b-001" : "product-it-plan-join-c-001" },
      body: "{}",
    });
    expect(winningRetry.status).toBe(200);

    const meetupPlanResponse = await api(alice, "/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-create-0002" },
      body: JSON.stringify({ activity: "walk", starts_at: startsAt, place_text: "Integration Park", visibility: "private", participant_limit: 2 }),
    });
    expect(meetupPlanResponse.status).toBe(201);
    const meetupPlan = await meetupPlanResponse.json();
    planIds.push(meetupPlan.plan.id);

    // A deliberately shared private Plan remains private to authenticated
    // non-members. Only its capability URL may return the minimized preview.
    const privateRead = await api(casey, `/api/plans/${meetupPlan.plan.id}`);
    expect(privateRead.status).toBe(404);
    const shareResponse = await api(alice, `/api/plans/${meetupPlan.plan.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(shareResponse.status).toBe(201);
    const share = await shareResponse.json();
    expect(typeof share.token).toBe("string");
    const publicPreview = await fetch(`${appUrl()}/api/plans/share/${share.token}`);
    expect(publicPreview.status).toBe(200);
    const previewPayload = await publicPreview.json();
    expect(previewPayload.plan).toEqual(expect.objectContaining({ id: meetupPlan.plan.id, activity: "walk" }));
    expect(previewPayload.plan).not.toHaveProperty("visibility");
    expect(previewPayload.plan).not.toHaveProperty("owner_id");
    const revokedShare = await api(alice, `/api/plans/${meetupPlan.plan.id}/share`, { method: "DELETE" });
    expect(revokedShare.status).toBe(200);
    const revokedPreview = await fetch(`${appUrl()}/api/plans/share/${share.token}`);
    expect(revokedPreview.status).toBe(404);

    const bobJoin = await api(bob, `/api/plans/${meetupPlan.plan.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-join-b-002" },
      body: "{}",
    });
    expect(bobJoin.status).toBe(404);
    const sharedPlan = await api(alice, `/api/plans/${meetupPlan.plan.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: "open" }),
    });
    expect(sharedPlan.status).toBe(200);
    const eligibleBobJoin = await api(bob, `/api/plans/${meetupPlan.plan.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-join-b-003" },
      body: "{}",
    });
    expect(eligibleBobJoin.status).toBe(200);
    const started = await service.from("plans").update({ starts_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() }).eq("id", meetupPlan.plan.id);
    expect(started.error).toBeNull();

    const memberRecent = await api(bob, "/api/plans");
    expect(memberRecent.status).toBe(200);
    expect((await memberRecent.json()).plans.some((plan: { id: string }) => plan.id === meetupPlan.plan.id)).toBe(true);
    const nonMemberStatus = await api(casey, `/api/plans/${meetupPlan.plan.id}/meetups`);
    expect(nonMemberStatus.status).toBe(404);
    const directRpc = await casey.client.rpc("plan_meetup_status_v1", { p_actor_id: casey.id, p_plan_id: meetupPlan.plan.id });
    expect(directRpc.error).not.toBeNull();
    const directTableRead = await casey.client.from("plan_meetup_acknowledgements").select("id").eq("plan_id", meetupPlan.plan.id);
    expect(directTableRead.error).not.toBeNull();

    // These relations and functions are route-only. Verify an authenticated
    // browser token cannot bypass the server-owned authorization boundary.
    await expectServerOnlyReadDenied(casey.client.from("plans").select("id").eq("id", meetupPlan.plan.id));
    await expectServerOnlyReadDenied(casey.client.from("plan_members").select("user_id").eq("plan_id", meetupPlan.plan.id));
    await expectServerOnlyReadDenied(casey.client.from("plan_share_tokens").select("id").eq("plan_id", meetupPlan.plan.id));
    await expectServerOnlyReadDenied(casey.client.from("plan_join_idempotency").select("actor_id").eq("actor_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("plan_create_idempotency").select("actor_id").eq("actor_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("pokes").select("id").eq("id", poke.poke.id));
    await expectServerOnlyReadDenied(casey.client.from("user_availabilities").select("user_id").eq("user_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("social_idempotency_records").select("actor_id").eq("actor_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("product_first_activations").select("user_id").eq("user_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("product_activity_days").select("user_id").eq("user_id", casey.id));
    await expectServerOnlyReadDenied(casey.client.from("product_discovery_daily_activity").select("user_id").eq("user_id", casey.id));
    const directPokeRpc = await casey.client.rpc("create_poke", {
      p_sender_id: casey.id,
      p_recipient_id: alice.id,
      p_activity: "coffee",
      p_custom_label: null,
      p_note: null,
      p_idempotency_key: "product-it-direct-poke-0001",
    });
    expect(directPokeRpc.error).not.toBeNull();
    const directAvailabilityRpc = await casey.client.rpc("upsert_user_availability", {
      p_user_id: casey.id,
      p_activity: "coffee",
      p_custom_label: null,
      p_duration_minutes: 30,
    });
    expect(directAvailabilityRpc.error).not.toBeNull();

    const firstConfirmation = await api(alice, `/api/plans/${meetupPlan.plan.id}/meetups`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-meetup-a-0001" },
      body: JSON.stringify({ peerId: bob.id }),
    });
    expect(firstConfirmation.status).toBe(200);
    const secondConfirmation = await api(bob, `/api/plans/${meetupPlan.plan.id}/meetups`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-meetup-b-0001" },
      body: JSON.stringify({ peerId: alice.id }),
    });
    expect(secondConfirmation.status).toBe(200);
    const confirmed = await api(alice, `/api/plans/${meetupPlan.plan.id}/meetups`);
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).acknowledgements).toEqual(expect.arrayContaining([
      expect.objectContaining({ peerId: bob.id, viewerConfirmed: true, peerConfirmed: true, confirmedAt: expect.any(String) }),
    ]));

    const block = await service.from("user_blocks").insert({ blocker_id: alice.id, blocked_id: bob.id });
    expect(block.error).toBeNull();
    const v2AfterBlock = await api(alice, "/api/availability?radiusKm=2&discovery_context=1");
    expect(v2AfterBlock.status).toBe(200);
    expect((await v2AfterBlock.json() as DiscoveryResponse).people.some((person) => person.profile.id === bob.id)).toBe(false);
    const blockedMeetup = await api(alice, `/api/plans/${meetupPlan.plan.id}/meetups`);
    expect(blockedMeetup.status).toBe(200);
    expect((await blockedMeetup.json()).acknowledgements).toEqual([]);
    const blockedPoke = await api(alice, "/api/pokes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-poke-blocked-01" },
      body: JSON.stringify({ recipientId: bob.id, activity: "coffee", customLabel: null }),
    });
    expect(blockedPoke.status).toBe(404);

    // Exercise the account-erasure worker transaction with only records owned
    // by a tracked synthetic account. This catches missing cascades in new
    // social tables without selecting or deleting any pre-existing records.
    const caseyAvailability = await api(casey, "/api/availability", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activity: "coffee", customLabel: null, durationMinutes: 30 }),
    });
    expect(caseyAvailability.status).toBe(200);
    const caseyPlanResponse = await api(casey, "/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-plan-create-c-001" },
      body: JSON.stringify({ activity: "coffee", starts_at: startsAt, place_text: "Casey cleanup cafe", visibility: "private", participant_limit: 2 }),
    });
    expect(caseyPlanResponse.status).toBe(201);
    const caseyPlan = await caseyPlanResponse.json();
    planIds.push(caseyPlan.plan.id);
    const caseyShareResponse = await api(casey, `/api/plans/${caseyPlan.plan.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(caseyShareResponse.status).toBe(201);
    const caseyPokeResponse = await api(casey, "/api/pokes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "product-it-poke-create-c-001" },
      body: JSON.stringify({ recipientId: alice.id, activity: "coffee", customLabel: null }),
    });
    expect(caseyPokeResponse.status).toBe(200);
    const caseyPoke = await caseyPokeResponse.json();
    pokeIds.push(caseyPoke.poke.id);

    const erased = await service.rpc("erase_account_data", { p_user_id: casey.id });
    expect(erased.error).toBeNull();
    expect(erased.data.success).toBe(true);
    const [erasedPlan, erasedMembers, erasedShares, erasedPoke, erasedAvailability, erasedActivation, erasedActivity, erasedDiscovery, erasedIdempotency, erasedOutbox] = await Promise.all([
      service.from("plans").select("id").eq("id", caseyPlan.plan.id),
      service.from("plan_members").select("plan_id").eq("plan_id", caseyPlan.plan.id),
      service.from("plan_share_tokens").select("plan_id").eq("plan_id", caseyPlan.plan.id),
      service.from("pokes").select("id").eq("id", caseyPoke.poke.id),
      service.from("user_availabilities").select("user_id").eq("user_id", casey.id),
      service.from("product_first_activations").select("user_id").eq("user_id", casey.id),
      service.from("product_activity_days").select("user_id").eq("user_id", casey.id),
      service.from("product_discovery_daily_activity").select("user_id").eq("user_id", casey.id),
      service.from("social_idempotency_records").select("actor_id").eq("actor_id", casey.id),
      service.from("outbox_events").select("id").eq("aggregate_id", caseyPoke.poke.id),
    ]);
    const erasedRecords = {
      plans: erasedPlan,
      members: erasedMembers,
      shares: erasedShares,
      pokes: erasedPoke,
      availability: erasedAvailability,
      firstActivation: erasedActivation,
      activityDays: erasedActivity,
      discoveryActivity: erasedDiscovery,
      socialIdempotency: erasedIdempotency,
      outbox: erasedOutbox,
    };
    for (const [relation, result] of Object.entries(erasedRecords)) {
      expect(result.error).toBeNull();
      expect(result.data, `${relation} must be erased with the synthetic account`).toEqual([]);
    }

    // Model a request that passed API authentication immediately before
    // erasure and reaches a service-owned RPC after the account tombstone.
    // Each write must fail closed and must not recreate private activity.
    const staleJoin = await service.rpc("plan_join_v1", {
      p_actor_id: casey.id,
      p_plan_id: capacityPlan.plan.id,
      p_idempotency_key: "product-it-stale-plan-join-001",
      p_request_hash: "a".repeat(64),
      p_share_token: null,
    });
    const staleAvailability = await service.rpc("upsert_user_availability", {
      p_user_id: casey.id,
      p_activity: "coffee",
      p_custom_label: null,
      p_duration_minutes: 30,
    });
    const staleDiscovery = await service.rpc("record_product_discovery_v1", {
      p_user_id: casey.id,
      p_2: 0,
      p_10: 0,
      p_25: 0,
    });
    expect(staleJoin.error).not.toBeNull();
    expect(staleAvailability.error).not.toBeNull();
    expect(staleDiscovery.error).not.toBeNull();
    const [staleJoinRecord, staleAvailabilityRecord, staleActivationRecord, staleActivityRecord, staleDiscoveryRecord] = await Promise.all([
      service.from("plan_join_idempotency").select("actor_id").eq("actor_id", casey.id),
      service.from("user_availabilities").select("user_id").eq("user_id", casey.id),
      service.from("product_first_activations").select("user_id").eq("user_id", casey.id),
      service.from("product_activity_days").select("user_id").eq("user_id", casey.id),
      service.from("product_discovery_daily_activity").select("user_id").eq("user_id", casey.id),
    ]);
    for (const [relation, result] of Object.entries({
      staleJoinRecord,
      staleAvailabilityRecord,
      staleActivationRecord,
      staleActivityRecord,
      staleDiscoveryRecord,
    })) {
      expect(result.error).toBeNull();
      expect(result.data, `${relation} must stay absent after a stale RPC`).toEqual([]);
    }
  }, 90_000);

  it("enforces temporary conversations through hosted RPCs and real authenticated API routes", async () => {
    const alice = await createSyntheticUser("wa");
    const bob = await createSyntheticUser("wb");
    users.push(alice, bob);
    const location = await service.from("user_locations").upsert([
      { user_id: alice.id, lat: 42.6977, lng: 23.3219, updated_at: new Date().toISOString() },
      { user_id: bob.id, lat: 42.6981, lng: 23.3223, updated_at: new Date().toISOString() },
    ], { onConflict: "user_id" });
    expect(location.error).toBeNull();
    for (const user of [alice, bob]) {
      expect((await api(user, "/api/availability", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity: "coffee", customLabel: null, durationMinutes: 60 }),
      })).status).toBe(200);
    }
    async function acceptNewPoke() {
      const sent = await api(alice, "/api/pokes", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
        body: JSON.stringify({ recipientId: bob.id, activity: "coffee", note: "Synthetic conversation-window check" }),
      });
      expect(sent.status).toBe(201);
      const payload = await sent.json();
      pokeIds.push(payload.poke.id);
      const accepted = await api(bob, `/api/pokes/${payload.poke.id}`, {
        method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
        body: JSON.stringify({ action: "accept" }),
      });
      expect(accepted.status).toBe(200);
      const result = await accepted.json();
      threadIds.push(result.threadId);
      return { pokeId: payload.poke.id as string, threadId: result.threadId as string };
    }
    const first = await acceptNewPoke();
    const path = `/api/dm/${first.threadId}`;
    const access = await api(alice, `${path}/access`);
    expect(access.status).toBe(200);
    const active = await access.json();
    expect(active).toEqual(expect.objectContaining({ basis: "poke", account_id: alice.id, thread_id: first.threadId }));
    expect(Date.parse(active.expires_at)).toBeGreaterThan(Date.parse(active.server_now));
    expect((await users[0].client.rpc("read_dm_conversation_facts_v1", { p_thread_id: first.threadId, p_actor_id: alice.id })).error).not.toBeNull();
    expect((await api(users[0], `${path}/access`)).status).toBe(404);

    const clientId = randomUUID();
    const send = (id: string, content = "Retain this synthetic history") => api(alice, path, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": id },
      body: JSON.stringify({ client_id: id, content, message_type: "text" }),
    });
    const sent = await send(clientId);
    expect(sent.status).toBe(200);
    const original = await sent.json();

    // Start with the actual hosted RPC. Neither synthetic user has a push device.
    const callId = randomUUID();
    const callCommand = randomUUID();
    callIds.push(callId);
    const args = { p_call_id: callId, p_thread_id: first.threadId, p_actor_id: alice.id, p_command_id: callCommand, p_payload_hash: "a".repeat(64) };
    const started = await service.rpc("begin_call_session", args);
    expect(started.error).toBeNull();
    expect(started.data.replayed).toBe(false);
    const expired = await service.from("pokes").update({ responded_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }).eq("id", first.pokeId);
    expect(expired.error).toBeNull();
    const endedAccess = await api(alice, `${path}/access`);
    const ended = await endedAccess.json();
    expect(endedAccess.status).toBe(200);
    expect(Date.parse(ended.expires_at)).toBeLessThan(Date.parse(ended.server_now));
    const replay = await send(clientId);
    expect(replay.status).toBe(200);
    expect((await replay.json()).message.id).toBe(original.message.id);
    const deniedSend = await send(randomUUID());
    expect(deniedSend.status).toBe(409);
    expect((await deniedSend.json()).code).toBe("POKE_CONVERSATION_EXPIRED");
    for (const endpoint of ["suggestions", "venues"]) {
      expect((await api(alice, `${path}/${endpoint}`)).status).toBe(409);
    }
    const replayCall = await service.rpc("begin_call_session", args);
    expect(replayCall.error).toBeNull();
    expect(replayCall.data.replayed).toBe(true);
    const delivery = await service.rpc("authorize_call_invite_delivery", { p_call_id: callId, p_thread_id: first.threadId, p_caller_id: alice.id, p_callee_id: bob.id });
    expect(delivery.error).toBeNull();
    expect(delivery.data).toBe(false);
    const cancelled = await service.rpc("advance_call_session", {
      p_call_id: callId, p_thread_id: first.threadId, p_actor_id: alice.id, p_capability: started.data.capability,
      p_command_id: randomUUID(), p_event_type: "cancel", p_payload_hash: "b".repeat(64),
    });
    expect(cancelled.error).toBeNull();
    const deniedCallId = randomUUID();
    callIds.push(deniedCallId);
    const deniedCall = await api(alice, `${path}/call`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: 1, commandId: randomUUID(), callId: deniedCallId, type: "invite" }),
    });
    expect(deniedCall.status).toBe(409);
    expect((await deniedCall.json()).code).toBe("POKE_CONVERSATION_EXPIRED");
    const history = await api(alice, path);
    expect(history.status).toBe(200);
    expect((await history.json()).messages.some((message: { id: string }) => message.id === original.message.id)).toBe(true);
    const stored = await service.from("dm_messages").select("id").eq("thread_id", first.threadId).eq("message_type", "text");
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(1);

    // A Plan is independently owned; the source thread is attribution only.
    const independent = await api(alice, "/api/plans", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify({ activity: "coffee", starts_at: new Date(Date.now() + 3_600_000).toISOString(), place_text: "Synthetic public café", visibility: "private", participant_limit: 2, source_thread_id: first.threadId }),
    });
    expect(independent.status).toBe(201);
    const independentPlan = await independent.json();
    planIds.push(independentPlan.plan.id);
    const members = await service.from("plan_members").select("user_id").eq("plan_id", independentPlan.plan.id);
    expect(members.error).toBeNull();
    expect(members.data).toEqual([{ user_id: alice.id }]);
    expect((await api(bob, `/api/plans/${independentPlan.plan.id}`)).status).toBe(404);

    const renewed = await acceptNewPoke();
    expect(renewed.threadId).toBe(first.threadId);
    expect((await send(randomUUID(), "Accepted renewal allows this message")).status).toBe(200);
    const friendship = await service.from("friendships").insert({ requester_id: alice.id, addressee_id: bob.id, status: "accepted" });
    expect(friendship.error).toBeNull();
    const ongoing = await api(alice, `${path}/access`);
    expect(await ongoing.json()).toEqual(expect.objectContaining({ basis: "friendship", expires_at: null }));
    const block = await service.from("user_blocks").insert({ blocker_id: bob.id, blocked_id: alice.id });
    expect(block.error).toBeNull();
    expect((await api(alice, `${path}/access`)).status).toBe(404);
  }, 90_000);

});
