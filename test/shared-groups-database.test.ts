import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APPROVED_PROJECT_REF = "ttojvnwpnpuhkyjncwxn";
const url = process.env.SUPABASE_TEST_URL;
const appUrl = process.env.SUPABASE_TEST_APP_URL?.replace(/\/+$/, "");
const isLocalAppUrl = (() => {
  if (!appUrl) return false;
  try {
    const parsed = new URL(appUrl);
    return parsed.origin === appUrl && new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname);
  } catch {
    return false;
  }
})();
const isApprovedRemoteAppUrl = appUrl === "https://www.peek-poke.com";
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
const appTargetAllowed = isLocalAppUrl || (isApprovedRemoteUrl && isApprovedRemoteAppUrl && remoteTargetOptedIn);
const databaseTargetAllowed = (isLocalUrl && isLocalAppUrl) || (isApprovedRemoteUrl && appTargetAllowed && remoteTargetOptedIn);
const databaseTestRequested = Boolean(process.env.SUPABASE_TEST_TARGET || url || appUrl || serviceRoleKey || anonKey);
if (databaseTestRequested && (!url || !serviceRoleKey || !anonKey || !appUrl || !databaseTargetAllowed)) {
  throw new Error(`Shared-group database tests require approved database target ${APPROVED_PROJECT_REF}, local or verified application target, complete credentials, and SUPABASE_TEST_TARGET opt-in.`);
}
function requireDatabaseTestConfig() {
  if (!url || !serviceRoleKey || !anonKey || !appUrl || !databaseTargetAllowed) {
    throw new Error(`Shared-group database tests require approved database target ${APPROVED_PROJECT_REF}, local or verified SUPABASE_TEST_APP_URL, complete credentials, and SUPABASE_TEST_TARGET opt-in.`);
  }
}

let supabase: SupabaseClient;
let authenticatedSessions: SupabaseClient[] = [];
let userIds: string[] = [];
let credentials: Array<{ email: string; password: string }> = [];
let qrContent = "";

async function appRequest(index: number, path: string, init: RequestInit = {}) {
  const { data: { session } } = await authenticatedSessions[index].auth.getSession();
  if (!session) throw new Error("Authenticated test session is unavailable");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.access_token}`);
  return fetch(`${appUrl}${path}`, { ...init, headers });
}

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

describe("shared group database boundary", () => {
  beforeAll(async () => {
    requireDatabaseTestConfig();
    supabase = createClient(url!, serviceRoleKey!);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    for (const role of ["a", "b", "c", "d"]) {
      const user = await createTestUser(`${suffix}_${role}`);
      userIds.push(user.userId);
      credentials.push({ email: user.email, password: user.password });
    }
    qrContent = `database-boundary-${suffix}`;
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
    const { data: deletionJobs } = await supabase
      .from("account_deletion_jobs")
      .select("id")
      .in("user_id", userIds);
    const deletionJobIds = (deletionJobs ?? []).map((job) => job.id);
    if (deletionJobIds.length > 0) {
      await supabase
        .from("outbox_events")
        .delete()
        .eq("event_type", "account.cleanup")
        .in("aggregate_id", deletionJobIds);
      await supabase.from("account_deletion_jobs").delete().in("id", deletionJobIds);
    }
    await supabase.from("profiles").delete().in("id", userIds);
    await Promise.all(userIds.map((userId) => supabase.auth.admin.deleteUser(userId)));
  });

  it("converges concurrent first scans and isolates a different QR payload", async () => {
    const [firstResponse, secondResponse, differentResponse] = await Promise.all([
      appRequest(0, "/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qr_content: qrContent }),
      }),
      appRequest(1, "/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qr_content: qrContent }),
      }),
      appRequest(2, "/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qr_content: `${qrContent}-different` }),
      }),
    ]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(differentResponse.status).toBe(200);
    const first = await firstResponse.json();
    const second = await secondResponse.json();
    const different = await differentResponse.json();
    const sharedGroupId = first.group.id;
    expect(sharedGroupId).toBe(second.group.id);
    expect(sharedGroupId).not.toBe(different.group.id);

    const { data: memberships, error } = await supabase
      .from("shared_group_members")
      .select("group_id, user_id")
      .in("user_id", userIds);
    expect(error).toBeNull();
    expect(memberships).toHaveLength(3);
    expect(memberships?.filter((membership) => membership.group_id === sharedGroupId)).toHaveLength(2);
    const differentGroupId = different.group.id;
    expect(memberships?.filter((membership) => membership.group_id === differentGroupId)).toHaveLength(1);

    const memberReadResponse = await appRequest(0, `/api/groups/${sharedGroupId}`);
    const nonmemberReadResponse = await appRequest(2, `/api/groups/${sharedGroupId}`);
    expect(memberReadResponse.status).toBe(200);
    expect(nonmemberReadResponse.status).toBe(404);
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
    const thirdJoinResponse = await appRequest(3, "/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qr_content: qrContent }),
    });
    expect(thirdJoinResponse.status).toBe(200);
    expect((await thirdJoinResponse.json()).group.id).toBe(sharedGroupId);

    const clientId = randomUUID();
    const sentResponse = await appRequest(1, `/api/groups/${sharedGroupId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": clientId },
      body: JSON.stringify({ client_id: clientId, content: "member message" }),
    });
    const replayResponse = await appRequest(1, `/api/groups/${sharedGroupId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": clientId },
      body: JSON.stringify({ client_id: clientId, content: "member message" }),
    });
    const outsiderClientId = randomUUID();
    const outsiderResponse = await appRequest(2, `/api/groups/${sharedGroupId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": outsiderClientId },
      body: JSON.stringify({ client_id: outsiderClientId, content: "outsider message" }),
    });
    expect(sentResponse.status).toBe(200);
    expect(replayResponse.status).toBe(200);
    expect(outsiderResponse.status).toBe(404);
    const sent = await sentResponse.json();
    const replay = await replayResponse.json();
    expect(sent.message.id).toBe(replay.message.id);
    expect(replayResponse.headers.get("idempotency-key")).toBe(clientId);
    const readResponse = await appRequest(1, `/api/groups/${sharedGroupId}/read`, {
      method: "POST",
    });
    expect(readResponse.status).toBe(200);
    const senderClientId = randomUUID();
    const senderResponse = await appRequest(0, `/api/groups/${sharedGroupId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": senderClientId },
      body: JSON.stringify({ client_id: senderClientId, content: "sender message" }),
    });
    expect(senderResponse.status).toBe(200);
    const deleteSenderResponse = await appRequest(0, "/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect(deleteSenderResponse.status).toBe(202);
    const { data: deletedSenderMessages, error: deletedSenderMessagesError } = await supabase
      .from("shared_group_messages")
      .select("id")
      .eq("sender_id", userIds[0]);
    expect(deletedSenderMessagesError).toBeNull();
    expect(deletedSenderMessages).toEqual([]);
    const { data: remainingAfterAppErasure, error: remainingAfterAppErasureError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("group_id", sharedGroupId)
      .order("user_id");
    expect(remainingAfterAppErasureError).toBeNull();
    expect(remainingAfterAppErasure).toEqual([
      { user_id: userIds[1] },
      { user_id: userIds[3] },
    ]);

    const deleteDifferentResponse = await appRequest(2, "/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    expect(deleteDifferentResponse.status).toBe(202);
    const { data: deletedDifferentMemberships, error: deletedDifferentMembershipsError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("group_id", differentGroupId);
    expect(deletedDifferentMembershipsError).toBeNull();
    expect(deletedDifferentMemberships).toEqual([]);

    const [raceErasure, raceSend] = await Promise.all([
      supabase.rpc("erase_account_data", { p_user_id: userIds[1] }),
      supabase.rpc("send_shared_group_message_transactional", {
        p_group_id: sharedGroupId,
        p_sender_id: userIds[1],
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
      .eq("sender_id", userIds[1]);
    expect(racedMessagesError).toBeNull();
    expect(racedMessages).toEqual([]);
    const { data: racedMemberships, error: racedMembershipsError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("user_id", userIds[1]);
    expect(racedMembershipsError).toBeNull();
    expect(racedMemberships).toEqual([]);

    const erasure = await supabase.rpc("erase_account_data", { p_user_id: userIds[1] });
    expect(erasure.error).toBeNull();
    expect(erasure.data.success).toBe(true);
    const { data: remainingMembers, error: remainingMembersError } = await supabase
      .from("shared_group_members")
      .select("user_id")
      .eq("group_id", sharedGroupId);
    expect(remainingMembersError).toBeNull();
    expect(remainingMembers).toEqual([{ user_id: userIds[3] }]);
  });
});
