import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRIVATE_DM_MEDIA_BUCKET } from "@/lib/storage-urls";
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
    "Product Storage database tests",
  );
}

type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

const runTag = `ppst${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
const generatedObjectPaths: string[] = [];
const authUserIds: string[] = [];
const sessionClients = new Set<SupabaseClient>();
let service: SupabaseClient;
let owner: TestUser;
let outsider: TestUser;

function requireConfig() {
  requireSupabaseIntegrationTarget(
    target,
    process.env,
    ["SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY", "SUPABASE_TEST_ANON_KEY"],
    "Product Storage database tests",
  );
}

async function createAuthenticatedClient(email: string, password: string) {
  const client = createClient(url!, anonKey!);
  sessionClients.add(client);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return client;
}

async function createSyntheticUser(label: string): Promise<TestUser> {
  const email = `peek-poke-storage-${runTag}-${label}@test.invalid`;
  const password = `StorageIntegration-${randomUUID()}!`;
  const created = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (created.error || !created.data.user) throw created.error ?? new Error("Synthetic Storage user creation failed");

  const id = created.data.user.id;
  authUserIds.push(id);
  const profile = await service.from("profiles").upsert({
    id,
    auth_user_id: id,
    username: `st_${runTag.slice(-9)}_${label}`,
    display_name: `Storage ${label}`,
    onboarding_completed: true,
    deleted_at: null,
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;
  const verified = await service.from("profiles").select("id").eq("id", id).maybeSingle();
  if (verified.error || verified.data?.id !== id)
    throw verified.error ?? new Error("Synthetic Storage profile verification failed");

  return { id, email, password, client: await createAuthenticatedClient(email, password) };
}

async function verifyPrivateBucket() {
  const response = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(PRIVATE_DM_MEDIA_BUCKET)}`, {
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey!,
    },
  });
  if (!response.ok) throw new Error(`Storage bucket metadata failed: ${response.status}`);
  const bucket = await response.json() as { public?: unknown };
  if (bucket.public !== false) throw new Error(`${PRIVATE_DM_MEDIA_BUCKET} must be private for this test`);
}

async function verifyObjectAbsent(path: string) {
  const separator = path.lastIndexOf("/");
  const folder = separator === -1 ? "" : path.slice(0, separator);
  const name = separator === -1 ? path : path.slice(separator + 1);
  const listed = await service.storage.from(PRIVATE_DM_MEDIA_BUCKET).list(folder, { search: name });
  if (listed.error) throw listed.error;
  if (listed.data.some((object) => object.name === name)) {
    throw new Error(`Synthetic Storage object remained after cleanup: ${path}`);
  }
}

async function cleanUp() {
  const failures: Error[] = [];
  const collect = (result: PromiseSettledResult<unknown>) => {
    if (result.status === "rejected") failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
  };

  const objectResults = await Promise.allSettled(generatedObjectPaths.map(async (path) => {
    const removal = await service.storage.from(PRIVATE_DM_MEDIA_BUCKET).remove([path]);
    if (removal.error) throw removal.error;
    await verifyObjectAbsent(path);
  }));
  objectResults.forEach(collect);
  generatedObjectPaths.length = 0;

  const sessionResults = await Promise.allSettled([...sessionClients].map((client) => client.auth.signOut()));
  sessionResults.forEach(collect);
  sessionClients.clear();

  if (authUserIds.length > 0) {
    const profileRemoval = await service.from("profiles").delete().in("id", authUserIds);
    if (profileRemoval.error) failures.push(profileRemoval.error);
  }
  const identityResults = await Promise.allSettled(authUserIds.map(async (id) => {
    const deleted = await service.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
  }));
  identityResults.forEach(collect);

  if (failures.length > 0) throw new AggregateError(failures, "Synthetic Storage cleanup failed");
}

describe.skipIf(!configured)("private media Storage authorization", { timeout: 45_000, hookTimeout: 30_000 }, () => {
  beforeAll(async () => {
    requireConfig();
    service = createClient(url!, serviceRoleKey!);
    await verifyPrivateBucket();
    [owner, outsider] = await Promise.all([createSyntheticUser("owner"), createSyntheticUser("outsider")]);
  });

  afterAll(async () => {
    if (!service) return;
    await cleanUp();
  });

  it("keeps an owner-scoped private media object service-only and denies authenticated reads or signed URLs", async () => {
    const path = `${owner.id}/product-storage-${runTag}.png`;
    generatedObjectPaths.push(path);
    const asset = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9aQAAAABJRU5ErkJggg==",
      "base64",
    );

    // The application creates DM media with its server service client after
    // route-level participant and upload checks. The live catalog has no
    // authenticated Storage policy for this bucket, so direct client access
    // must remain denied rather than being treated as an owner capability.
    const uploaded = await service.storage.from(PRIVATE_DM_MEDIA_BUCKET).upload(path, asset, {
      contentType: "image/png",
      upsert: false,
    });
    expect(uploaded.error).toBeNull();
    expect(uploaded.data?.path).toBe(path);

    const serviceRead = await service.storage.from(PRIVATE_DM_MEDIA_BUCKET).download(path);
    expect(serviceRead.error).toBeNull();
    expect(serviceRead.data).not.toBeNull();
    expect((await serviceRead.data!.arrayBuffer()).byteLength).toBe(asset.byteLength);

    const ownerRead = await owner.client.storage.from(PRIVATE_DM_MEDIA_BUCKET).download(path);
    expect(ownerRead.error).not.toBeNull();

    const outsiderRead = await outsider.client.storage.from(PRIVATE_DM_MEDIA_BUCKET).download(path);
    expect(outsiderRead.error).not.toBeNull();

    const ownerSignedUrl = await owner.client.storage
      .from(PRIVATE_DM_MEDIA_BUCKET)
      .createSignedUrl(path, 60);
    expect(ownerSignedUrl.error).not.toBeNull();

    const outsiderSignedUrl = await outsider.client.storage
      .from(PRIVATE_DM_MEDIA_BUCKET)
      .createSignedUrl(path, 60);
    expect(outsiderSignedUrl.error).not.toBeNull();

    const deleted = await service.storage.from(PRIVATE_DM_MEDIA_BUCKET).remove([path]);
    expect(deleted.error).toBeNull();
    await expect(verifyObjectAbsent(path)).resolves.toBeUndefined();
  });
});
