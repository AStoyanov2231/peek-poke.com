import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APPROVED_PROJECT_REF = "ttojvnwpnpuhkyjncwxn";
const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const isLocalUrl = (() => {
  if (!url) return false;
  try {
    return new Set(["localhost", "127.0.0.1", "::1"]).has(new URL(url).hostname);
  } catch {
    return false;
  }
})();
const isApprovedRemoteUrl = (() => {
  if (!url) return false;
  try {
    return new URL(url).origin === `https://${APPROVED_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
})();
const remoteTargetOptedIn = process.env.SUPABASE_TEST_TARGET === APPROVED_PROJECT_REF;
const databaseTargetAllowed = isLocalUrl || (isApprovedRemoteUrl && remoteTargetOptedIn);
const databaseTestRequested = Boolean(process.env.SUPABASE_TEST_TARGET || url || serviceRoleKey || anonKey);
if (databaseTestRequested && (!url || !serviceRoleKey || !anonKey || !databaseTargetAllowed)) {
  throw new Error(`Shared-group migration tests require the approved target ${APPROVED_PROJECT_REF} with complete credentials and SUPABASE_TEST_TARGET opt-in.`);
}
function requireDatabaseTestConfig() {
  if (!url || !serviceRoleKey || !anonKey || !databaseTargetAllowed) {
    throw new Error(`Shared-group migration tests require SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_ANON_KEY, and approved target ${APPROVED_PROJECT_REF}.`);
  }
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
}

describe("shared QR group migration semantics", () => {
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
