import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userSyncChannelName } from "@peekpoke/shared";
import {
  requireSupabaseIntegrationTarget,
  resolveSupabaseIntegrationTarget,
} from "./support/supabase-integration-target";

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const target = resolveSupabaseIntegrationTarget(process.env, { requireLocalAppUrl: false });
const configured = Boolean(target.configured && url && serviceRoleKey && anonKey);

if (target.requested && !configured) {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Product Realtime database tests",
  );
}

type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

type SubscriptionResult = {
  status: string;
  error: Error | undefined;
};

type CatalogCounts = {
  profiles: number;
  authUsers: number;
  storageObjects: number;
};

const runTag = `pprt${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
let service: SupabaseClient;
let owner: TestUser;
let outsider: TestUser;
const authUserIds: string[] = [];
const channels: Array<{ client: SupabaseClient; channel: RealtimeChannel }> = [];
const sessionClients = new Set<SupabaseClient>();
let countsBefore: CatalogCounts;

function requireConfig() {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Product Realtime database tests",
  );
}

async function createSyntheticUser(label: string): Promise<TestUser> {
  const email = `peek-poke-realtime-${runTag}-${label}@test.invalid`;
  const password = `RealtimeIntegration-${randomUUID()}!`;
  const result = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic Realtime user creation failed");

  const id = result.data.user.id;
  authUserIds.push(id);
  const profile = await service.from("profiles").upsert({
    id,
    auth_user_id: id,
    username: `rt_${runTag.slice(-9)}_${label}`,
    display_name: `Realtime ${label}`,
    onboarding_completed: true,
    deleted_at: null,
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;
  const verification = await service.from("profiles").select("id").eq("id", id).maybeSingle();
  if (verification.error || verification.data?.id !== id)
    throw verification.error ?? new Error("Synthetic Realtime profile verification failed");
  const client = await createAuthenticatedClient(email, password);
  return { id, email, password, client };
}

async function createAuthenticatedClient(email: string, password: string) {
  const client = createClient(url!, anonKey!);
  sessionClients.add(client);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return client;
}

function trackSubscription(client: SupabaseClient, channel: RealtimeChannel, timeoutMs = 12_000) {
  channels.push({ client, channel });
  return new Promise<SubscriptionResult>((resolve) => {
    const timeout = setTimeout(() => resolve({ status: "TIMED_OUT", error: undefined }), timeoutMs);
    channel.subscribe((status, error) => {
      if (status !== "SUBSCRIBED" && status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;
      clearTimeout(timeout);
      resolve({ status, error: error instanceof Error ? error : undefined });
    });
  });
}

async function catalogCounts(): Promise<CatalogCounts> {
  const [profiles, authUsers, storageObjects] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }),
    service.auth.admin.listUsers({ page: 1, perPage: 1 }),
    storageObjectCount(),
  ]);
  if (profiles.error) throw profiles.error;
  if (authUsers.error) throw authUsers.error;
  return {
    profiles: profiles.count ?? 0,
    authUsers: authUsers.data.total,
    storageObjects,
  };
}

const storageHeaders = () => ({
  authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey!,
  "content-type": "application/json",
});

type StorageEntry = { id?: unknown; name?: unknown };

async function storageObjectCount() {
  const bucketsResponse = await fetch(`${url}/storage/v1/bucket`, { headers: storageHeaders() });
  if (!bucketsResponse.ok) throw new Error(`Storage bucket catalog failed: ${bucketsResponse.status}`);
  const buckets = await bucketsResponse.json() as Array<{ id?: unknown }>;

  const countPrefix = async (bucketId: string, prefix: string): Promise<number> => {
    let count = 0;
    let offset = 0;
    while (true) {
      const response = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
        method: "POST",
        headers: storageHeaders(),
        body: JSON.stringify({ prefix, limit: 1_000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`Storage object catalog failed: ${response.status}`);
      const entries = await response.json() as StorageEntry[];
      for (const entry of entries) {
        if (typeof entry.id === "string") count += 1;
        else if (typeof entry.name === "string") count += await countPrefix(bucketId, `${prefix}${entry.name}/`);
      }
      if (entries.length < 1_000) return count;
      offset += entries.length;
    }
  };

  let count = 0;
  for (const bucket of buckets) {
    if (typeof bucket.id === "string") count += await countPrefix(bucket.id, "");
  }
  return count;
}

async function broadcastAsService(topic: string, event: string, payload: unknown) {
  const response = await fetch(
    `${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}?private=true`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey!,
      },
      body: JSON.stringify(payload),
    },
  );
  expect(response.ok).toBe(true);
}

function waitForEvent(channel: RealtimeChannel, event: string, marker: string, timeoutMs = 12_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<unknown>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    channel.on("broadcast", { event }, ({ payload }) => {
      if (!payload || typeof payload !== "object" || (payload as { marker?: unknown }).marker !== marker) return;
      if (timeout) clearTimeout(timeout);
      resolve(payload);
    });
  });
  return { promise, cancel: () => timeout && clearTimeout(timeout) };
}

async function cleanUp() {
  const failures: Error[] = [];
  const collect = (result: PromiseSettledResult<unknown>) => {
    if (result.status === "rejected") failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
  };
  const channelResults = await Promise.allSettled(channels.map(async ({ client, channel }) => {
    await channel.unsubscribe();
    await client.removeChannel(channel);
  }));
  channelResults.forEach(collect);
  channels.length = 0;
  const signOutResults = await Promise.allSettled([...sessionClients].map((client) => client.auth.signOut()));
  signOutResults.forEach(collect);
  sessionClients.clear();
  const profileDeletion = await service.from("profiles").delete().in("id", authUserIds);
  if (profileDeletion.error) failures.push(profileDeletion.error);
  const identityResults = await Promise.allSettled(authUserIds.map(async (id) => {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }));
  identityResults.forEach(collect);
  if (failures.length > 0) throw new AggregateError(failures, "Synthetic Realtime cleanup failed");
}

describe.skipIf(!configured)("private user-sync Realtime authorization", { timeout: 45_000, hookTimeout: 30_000 }, () => {
  beforeAll(async () => {
    requireConfig();
    service = createClient(url!, serviceRoleKey!);
    countsBefore = await catalogCounts();
    [owner, outsider] = await Promise.all([createSyntheticUser("owner"), createSyntheticUser("outsider")]);
  });

  afterAll(async () => {
    if (!service) return;
    const failures: Error[] = [];
    try {
      await cleanUp();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
    try {
      expect(await catalogCounts()).toEqual(countsBefore);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (failures.length > 0) throw new AggregateError(failures, "Realtime integration teardown failed");
  });

  it("delivers an owner's private hint, denies an outsider, and accepts a new subscription after reconnect", async () => {
    const topic = userSyncChannelName(owner.id);
    const event = "messages-changed";

    const ownerChannel = owner.client.channel(topic, { config: { private: true } });
    await expect(trackSubscription(owner.client, ownerChannel)).resolves.toMatchObject({ status: "SUBSCRIBED" });

    const outsiderChannel = outsider.client.channel(topic, { config: { private: true } });
    const outsiderStatus = await trackSubscription(outsider.client, outsiderChannel);
    expect(outsiderStatus.status).toBe("CHANNEL_ERROR");

    const firstMarker = randomUUID();
    const firstEvent = waitForEvent(ownerChannel, event, firstMarker);
    try {
      await broadcastAsService(topic, event, {
        marker: firstMarker,
        thread_id: randomUUID(),
        actor_id: owner.id,
        action: "sent",
      });
      await expect(firstEvent.promise).resolves.toMatchObject({ marker: firstMarker, actor_id: owner.id });
    } finally {
      firstEvent.cancel();
    }

    await ownerChannel.unsubscribe();
    await owner.client.removeChannel(ownerChannel);
    const ownerChannelIndex = channels.findIndex(({ channel }) => channel === ownerChannel);
    if (ownerChannelIndex >= 0) channels.splice(ownerChannelIndex, 1);

    const reconnectedClient = await createAuthenticatedClient(owner.email, owner.password);
    const reconnectedChannel = reconnectedClient.channel(topic, { config: { private: true } });
    await expect(trackSubscription(reconnectedClient, reconnectedChannel)).resolves.toMatchObject({ status: "SUBSCRIBED" });
    const reconnectMarker = randomUUID();
    const reconnectEvent = waitForEvent(reconnectedChannel, event, reconnectMarker);
    try {
      await broadcastAsService(topic, event, {
        marker: reconnectMarker,
        thread_id: randomUUID(),
        actor_id: owner.id,
        action: "sent",
      });
      await expect(reconnectEvent.promise).resolves.toMatchObject({ marker: reconnectMarker, actor_id: owner.id });
    } finally {
      reconnectEvent.cancel();
    }
  });
});
