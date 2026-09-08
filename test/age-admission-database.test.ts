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
    "Age admission hosted integration tests",
  );
}

type TestUser = { id: string; email: string; password: string; client: SupabaseClient };
const runTag = `ppage${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
const authUserIds: string[] = [];
const sessionClients = new Set<SupabaseClient>();
let service: SupabaseClient;
let pending: TestUser;
let blocked: TestUser;
let adult: TestUser;

function requireConfig() {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_APP_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Age admission hosted integration tests",
  );
}

function appUrl() {
  if (!target.configured || !target.appUrl) throw new Error("Loopback app target is unavailable");
  return target.appUrl;
}

async function api(user: TestUser, path: string, init: RequestInit = {}) {
  const { data, error } = await user.client.auth.getSession();
  if (error || !data.session) throw error ?? new Error("Synthetic user session is unavailable");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${data.session.access_token}`);
  return fetch(`${appUrl()}${path}`, { ...init, headers });
}

async function createSyntheticUser(label: string): Promise<TestUser> {
  const email = `peek-poke-age-${runTag}-${label}@test.invalid`;
  const password = `AgeAdmission-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (created.error || !created.data.user) throw created.error ?? new Error("Synthetic age user creation failed");
  const id = created.data.user.id;
  authUserIds.push(id);
  const profile = await service.from("profiles").upsert({
    id,
    auth_user_id: id,
    username: `age_${runTag.slice(-10)}_${label}`.slice(0, 20),
    display_name: `Age ${label}`,
    onboarding_completed: true,
    deleted_at: null,
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;

  const client = createClient(url!, anonKey!);
  sessionClients.add(client);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, email, password, client };
}

async function cleanUp() {
  const failures: Error[] = [];
  const collect = (result: PromiseSettledResult<unknown>) => {
    if (result.status === "rejected") failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
  };
  const signOut = await Promise.allSettled([...sessionClients].map((client) => client.auth.signOut()));
  signOut.forEach(collect);
  sessionClients.clear();
  if (authUserIds.length > 0) {
    const { data: jobs, error: jobsError } = await service
      .from("account_deletion_jobs")
      .select("id")
      .in("user_id", authUserIds);
    if (jobsError) failures.push(jobsError);
    const jobIds = (jobs ?? []).map((job) => job.id);
    if (jobIds.length > 0) {
      const outbox = await service.from("outbox_events").delete().eq("event_type", "account.cleanup").in("aggregate_id", jobIds);
      if (outbox.error) failures.push(outbox.error);
      const deletionJobs = await service.from("account_deletion_jobs").delete().in("id", jobIds);
      if (deletionJobs.error) failures.push(deletionJobs.error);
    }
    const profiles = await service.from("profiles").delete().in("id", authUserIds);
    if (profiles.error) failures.push(profiles.error);
  }
  const identities = await Promise.allSettled(authUserIds.map(async (id) => {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }));
  identities.forEach(collect);
  if (failures.length > 0) throw new AggregateError(failures, "Synthetic age-admission cleanup failed");
}

async function serviceAdmission(userId: string) {
  const result = await service.rpc("read_account_age_admission_v1", { p_user_id: userId });
  if (result.error) throw result.error;
  return result.data as { status: "pending" | "adult" | "blocked"; decided_at: string | null };
}

describe.skipIf(!configured)("18+ age admission hosted boundary", { timeout: 45_000, hookTimeout: 30_000 }, () => {
  beforeAll(async () => {
    requireConfig();
    service = createClient(url!, serviceRoleKey!);
    [pending, blocked, adult] = await Promise.all([
      createSyntheticUser("pending"),
      createSyntheticUser("blocked"),
      createSyntheticUser("adult"),
    ]);
    const denied = await service.rpc("record_account_age_admission_v1", {
      p_user_id: blocked.id,
      p_is_adult: false,
    });
    if (denied.error || denied.data?.status !== "blocked")
      throw denied.error ?? new Error("Synthetic blocked age admission was not recorded");
  });

  afterAll(async () => {
    if (service) await cleanUp();
  });

  it("returns pending admission from bootstrap while denying social routes", async () => {
    const bootstrap = await api(pending, "/api/bootstrap");
    expect(bootstrap.status).toBe(200);
    await expect(bootstrap.json()).resolves.toMatchObject({
      age_admission: { status: "pending", decided_at: null },
      unread_summary: { threads: 0 },
    });

    const social = await api(pending, "/api/pokes");
    expect(social.status).toBe(403);
    await expect(social.json()).resolves.toMatchObject({ code: "AGE_ADMISSION_REQUIRED" });
  });

  it("keeps a blocked decision immutable and denies social access", async () => {
    const retryAsAdult = await api(blocked, "/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2000-01-01" }),
    });
    expect(retryAsAdult.status).toBe(200);
    await expect(retryAsAdult.json()).resolves.toMatchObject({ status: "blocked" });
    expect(await serviceAdmission(blocked.id)).toMatchObject({ status: "blocked" });

    const social = await api(blocked, "/api/pokes");
    expect(social.status).toBe(403);
    await expect(social.json()).resolves.toMatchObject({ code: "AGE_NOT_ELIGIBLE" });
  });

  it("records only an adult decision for an adult declaration", async () => {
    const declared = await api(adult, "/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2000-01-01" }),
    });
    expect(declared.status).toBe(200);
    const decision = await declared.json() as Record<string, unknown>;
    expect(decision).toEqual(expect.objectContaining({ status: "adult" }));
    expect(decision.decided_at).toEqual(expect.any(String));
    expect(decision).not.toHaveProperty("birth_date");

    const bootstrap = await api(adult, "/api/bootstrap");
    await expect(bootstrap.json()).resolves.toMatchObject({
      age_admission: { status: "adult" },
    });
  });

  it("keeps account deletion available to pending and blocked users, and purges final decisions", async () => {
    const anonymous = createClient(url!, anonKey!);
    const directWrite = await anonymous.rpc("record_account_age_admission_v1", {
      p_user_id: adult.id,
      p_is_adult: false,
    });
    expect(directWrite.error).not.toBeNull();

    const deleteAccount = (user: TestUser) => api(user, "/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect((await deleteAccount(pending)).status).toBe(202);
    expect((await deleteAccount(blocked)).status).toBe(202);
    expect(await serviceAdmission(blocked.id)).toEqual({ status: "pending", decided_at: null });

    expect((await deleteAccount(adult)).status).toBe(202);
    expect(await serviceAdmission(adult.id)).toEqual({ status: "pending", decided_at: null });
  });
});
