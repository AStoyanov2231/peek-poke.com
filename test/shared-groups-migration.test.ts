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
const target = resolveSupabaseIntegrationTarget(process.env, { requireLocalAppUrl: false });
const databaseTestConfigured = Boolean(target.configured && url && serviceRoleKey && anonKey);
if (target.requested && !databaseTestConfigured)
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Shared-group migration tests",
  );
function requireDatabaseTestConfig() {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Shared-group migration tests",
  );
}

let supabase: SupabaseClient;
let authenticated: SupabaseClient;
let userId = "";
let email = "";
let password = "";
let groupId = "";

async function createTestUser() {
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  email = `qr-migration-${suffix}@test.invalid`;
  password = "QrMigrationTestPassword-123!";
  const result = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (result.error || !result.data.user) throw result.error ?? new Error("Test user creation failed");
  userId = result.data.user.id;
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    auth_user_id: userId,
    username: `qr_migration_${suffix}`,
  });
  if (error) throw error;
  const admission = await supabase.rpc("record_account_age_admission_v1", {
    p_user_id: userId,
    p_is_adult: true,
  });
  if (admission.error || admission.data?.status !== "adult")
    throw admission.error ?? new Error("Synthetic QR user age admission was not recorded as adult");
}

describe.skipIf(!databaseTestConfigured)("shared QR group migration semantics", { timeout: 30_000, hookTimeout: 30_000 }, () => {
  beforeAll(async () => {
    requireDatabaseTestConfig();
    supabase = createClient(url!, serviceRoleKey!);
    authenticated = createClient(url!, anonKey!);
    await createTestUser();
    const { error } = await authenticated.auth.signInWithPassword({ email, password });
    if (error) throw error;
  });

  afterAll(async () => {
    if (!supabase || !userId) return;
    if (groupId) {
      await supabase.from("outbox_events").delete().eq("aggregate_type", "shared_group").eq("aggregate_id", groupId);
      await supabase.from("shared_group_messages").delete().eq("group_id", groupId);
      await supabase.from("shared_group_members").delete().eq("group_id", groupId);
      await supabase.from("shared_groups").delete().eq("id", groupId);
    }
    await supabase.from("profiles").delete().eq("id", userId);
    await supabase.auth.admin.deleteUser(userId);
  });

  it("executes the installed migration through service and authenticated database boundaries", async () => {
    const joined = await supabase.rpc("create_or_join_shared_group", {
      p_user_id: userId,
      p_qr_content: `migration-boundary-${randomUUID()}`,
    });
    expect(joined.error).toBeNull();
    expect(joined.data.group.id).toBeTruthy();
    groupId = joined.data.group.id;

    const listed = await supabase.rpc("get_shared_groups", { p_user_id: userId });
    expect(listed.error).toBeNull();
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].id).toBe(groupId);

    const directRead = await authenticated.from("shared_groups").select("id");
    expect(directRead.error).not.toBeNull();
    const deniedJoin = await authenticated.rpc("create_or_join_shared_group", {
      p_user_id: userId,
      p_qr_content: `denied-${randomUUID()}`,
    });
    expect(deniedJoin.error).not.toBeNull();
  });
});
