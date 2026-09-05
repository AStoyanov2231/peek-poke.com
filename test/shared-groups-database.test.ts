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
  throw new Error(`Shared-group database tests require the approved target ${APPROVED_PROJECT_REF} with complete credentials and SUPABASE_TEST_TARGET opt-in.`);
}
const describeDatabase = url && serviceRoleKey && anonKey && databaseTargetAllowed ? describe : describe.skip;

let supabase: SupabaseClient;
let sessions: SupabaseClient[] = [];
let authenticatedSessions: SupabaseClient[] = [];
let userIds: string[] = [];
let credentials: Array<{ email: string; password: string }> = [];
let qrContent = "";

async function createTestUser(suffix: string) {
  const email = `qr-group-${suffix}@test.invalid`;
  const password = "QrGroupTestPassword-123!";
  const result = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (result.error || !result.data.user) throw result.error ?? new Error("Test user creation failed");
  const userId = result.data.user.id;
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    auth_user_id: userId,
    username: `qr_group_${suffix}`,
  });
  if (error) throw error;
  return { email, password, userId };
}

describeDatabase("shared group database boundary", () => {
  beforeAll(async () => {
    supabase = createClient(url!, serviceRoleKey!);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    for (const role of ["a", "b", "c"]) {
      const user = await createTestUser(`${suffix}_${role}`);
      userIds.push(user.userId);
      credentials.push({ email: user.email, password: user.password });
    }
    qrContent = `database-boundary-${suffix}`;
    sessions = userIds.map(() => createClient(url!, serviceRoleKey!));
    authenticatedSessions = userIds.map(() => createClient(url!, anonKey!));
    for (const [index, session] of authenticatedSessions.entries()) {
      const { error } = await session.auth.signInWithPassword(credentials[index]);
      if (error) throw error;
    }
  });

  afterAll(async () => {
    if (!supabase || userIds.length === 0) return;
    const { data: groups } = await supabase
      .from("shared_groups")
      .select("id")
      .in("created_by", userIds);
    const groupIds = (groups ?? []).map((group) => group.id);
    if (groupIds.length > 0) {
      await supabase
        .from("outbox_events")
        .delete()
        .eq("aggregate_type", "shared_group")
        .in("aggregate_id", groupIds);
    }
    await supabase.from("shared_group_messages").delete().in("sender_id", userIds);
    await supabase.from("shared_group_members").delete().in("user_id", userIds);
    await supabase.from("shared_groups").delete().in("created_by", userIds);
    await supabase.from("profiles").delete().in("id", userIds);
    await Promise.all(userIds.map((userId) => supabase.auth.admin.deleteUser(userId)));
  });

  it("converges concurrent first scans and isolates a different QR payload", async () => {
    const [first, second, different] = await Promise.all([
      sessions[0].rpc("create_or_join_shared_group", { p_user_id: userIds[0], p_qr_content: qrContent }),
      sessions[1].rpc("create_or_join_shared_group", { p_user_id: userIds[1], p_qr_content: qrContent }),
      sessions[2].rpc("create_or_join_shared_group", { p_user_id: userIds[2], p_qr_content: `${qrContent}-different` }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(different.error).toBeNull();
    const sharedGroupId = first.data.group.id;
    expect(sharedGroupId).toBe(second.data.group.id);
    expect(sharedGroupId).not.toBe(different.data.group.id);

    const { data: memberships, error } = await supabase
      .from("shared_group_members")
      .select("group_id, user_id")
      .in("user_id", userIds);
    expect(error).toBeNull();
    expect(memberships).toHaveLength(3);
    expect(memberships?.filter((membership) => membership.group_id === sharedGroupId)).toHaveLength(2);
    expect(memberships?.filter((membership) => membership.group_id === different.data.group.id)).toHaveLength(1);

    const memberRead = await authenticatedSessions[0].from("shared_groups").select("id");
    const nonmemberRead = await authenticatedSessions[2].from("shared_groups").select("id");
    expect(memberRead.error).not.toBeNull();
    expect(nonmemberRead.error).not.toBeNull();
    const memberSend = await authenticatedSessions[1].rpc("send_shared_group_message_transactional", {
      p_group_id: sharedGroupId,
      p_sender_id: userIds[1],
      p_client_id: randomUUID(),
      p_content: "member message",
    });
    const nonmemberSend = await authenticatedSessions[2].rpc("send_shared_group_message_transactional", {
      p_group_id: sharedGroupId,
      p_sender_id: userIds[2],
      p_client_id: randomUUID(),
      p_content: "outsider message",
    });
    expect(memberSend.error).not.toBeNull();
    expect(nonmemberSend.error).not.toBeNull();
    const deniedRpc = await authenticatedSessions[0].rpc("create_or_join_shared_group", {
      p_user_id: userIds[0],
      p_qr_content: `${qrContent}-direct-call`,
    });
    expect(deniedRpc.error).not.toBeNull();

    const clientId = randomUUID();
    const sent = await supabase.rpc("send_shared_group_message_transactional", {
      p_group_id: first.data.group.id,
      p_sender_id: userIds[1],
      p_client_id: clientId,
      p_content: "member message",
    });
    const replay = await supabase.rpc("send_shared_group_message_transactional", {
      p_group_id: first.data.group.id,
      p_sender_id: userIds[1],
      p_client_id: clientId,
      p_content: "member message",
    });
    const outsider = await supabase.rpc("send_shared_group_message_transactional", {
      p_group_id: first.data.group.id,
      p_sender_id: userIds[2],
      p_client_id: randomUUID(),
      p_content: "outsider message",
    });
    expect(sent.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data.deduplicated).toBe(true);
    expect(outsider.error).toBeNull();
    expect(outsider.data).toEqual({ error: "GROUP_NOT_FOUND" });

    const [raceErasure, raceSend] = await Promise.all([
      supabase.rpc("erase_account_data", { p_user_id: userIds[0] }),
      supabase.rpc("send_shared_group_message_transactional", {
        p_group_id: sharedGroupId,
        p_sender_id: userIds[0],
        p_client_id: randomUUID(),
        p_content: "race message",
      }),
    ]);
    expect(raceErasure.error).toBeNull();
    expect(raceErasure.data.success).toBe(true);
    expect(raceSend.error).toBeNull();
    const { data: racedMessages, error: racedMessagesError } = await supabase
      .from("shared_group_messages")
      .select("id")
      .eq("sender_id", userIds[0]);
    expect(racedMessagesError).toBeNull();
    expect(racedMessages).toEqual([]);
    const { data: racedMemberships, error: racedMembershipsError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("user_id", userIds[0]);
    expect(racedMembershipsError).toBeNull();
    expect(racedMemberships).toEqual([]);

    const erasure = await supabase.rpc("erase_account_data", { p_user_id: userIds[0] });
    expect(erasure.error).toBeNull();
    expect(erasure.data.success).toBe(true);
    const { data: remainingMembers, error: remainingMembersError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("group_id", first.data.group.id);
    expect(remainingMembersError).toBeNull();
    expect(remainingMembers).toEqual([{ user_id: userIds[1] }]);
  });
});
