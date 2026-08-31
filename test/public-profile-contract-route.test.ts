import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicProfileResponseSchemaFor } from "@peekpoke/shared";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PUBLIC_PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const PRIVATE_PHOTO_ID = "44444444-4444-4444-8444-444444444444";
const FRIENDSHIP_ID = "55555555-5555-4555-8555-555555555555";
const INTEREST_ID = "66666666-6666-4666-8666-666666666666";
const TAG_ID = "77777777-7777-4777-8777-777777777777";
const timestamp = "2026-08-07T10:00:00.000Z";
const storageOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://project.supabase.co").replace(/\/$/, "");
const privateSignedUrl = `${storageOrigin}/storage/v1/object/sign/private-profile-photos/${TARGET_ID}/private.jpg?token=signed-token`;

const state = vi.hoisted(() => ({
  blocked: false,
  subscriber: false,
  rpcData: null as unknown,
  photoRows: [] as unknown[],
}));

const database = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  limit: vi.fn(),
  order: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  sign: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) =>
      handler(request, {
        user: { id: VIEWER_ID },
        params: routeContext?.params ? await routeContext.params : {},
        supabase: {},
      }),
  isBlocked: vi.fn(async () => state.blocked),
  hasSubscriberRole: vi.fn(async () => state.subscriber),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc, from: database.from }),
}));

vi.mock("@/lib/storage-urls", () => ({
  signPrivateProfilePhotos: storage.sign,
}));

import { GET } from "@/app/api/profile/[userId]/route";

const profile = {
  id: TARGET_ID,
  username: "target",
  display_name: "Target",
  bio: "Hello",
  avatar_url: "https://cdn.example/avatar.jpg",
  cover_image_url: null,
  location_text: "Sofia",
  is_online: true,
  last_seen_at: timestamp,
  created_at: timestamp,
  roles: ["subscriber"],
  deleted_at: null,
  stripe_customer_id: "cus_secret",
  push_tokens: [{ token: "secret" }],
};

const photo = (id: string, isPrivate: boolean) => ({
  id,
  user_id: TARGET_ID,
  storage_path: `${TARGET_ID}/${id}.jpg`,
  storage_bucket: isPrivate ? "private-profile-photos" : "profile-photos",
  thumbnail_storage_path: `${TARGET_ID}/${id}_thumb.jpg`,
  url: isPrivate
    ? `${storageOrigin}/storage/v1/object/public/private-profile-photos/${TARGET_ID}/${id}.jpg`
    : `${storageOrigin}/storage/v1/object/public/profile-photos/${TARGET_ID}/${id}.jpg`,
  thumbnail_url: isPrivate
    ? null
    : `${storageOrigin}/storage/v1/object/public/profile-photos/${TARGET_ID}/${id}_thumb.jpg`,
  is_avatar: !isPrivate,
  is_cover: false,
  is_private: isPrivate,
  display_order: isPrivate ? 1 : 0,
  created_at: timestamp,
  approval_status: "approved",
  reviewed_by: VIEWER_ID,
  reviewed_at: timestamp,
  rejection_reason: null,
});

function rpcPayload(profileValue: unknown = profile) {
  return {
    profile: profileValue,
    interests: [{
      id: INTEREST_ID,
      user_id: TARGET_ID,
      tag_id: TAG_ID,
      created_at: timestamp,
      tag: {
        id: TAG_ID,
        name: "Music",
        category: "Arts",
        icon: "music",
        display_order: 0,
        internal: "secret",
      },
      internal: "secret",
    }],
    stats: { photos_count: 99, friends_count: 3, meetings_count: 7 },
    friendship: {
      id: FRIENDSHIP_ID,
      requester_id: VIEWER_ID,
      addressee_id: TARGET_ID,
      status: "accepted",
      requested_at: timestamp,
      responded_at: timestamp,
      private_note: "secret",
    },
    internal: "secret",
  };
}

describe("public profile route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", storageOrigin);
    state.blocked = false;
    state.subscriber = false;
    state.rpcData = rpcPayload();
    state.photoRows = [photo(PUBLIC_PHOTO_ID, false), photo(PRIVATE_PHOTO_ID, true)];

    database.rpc.mockImplementation(async () => ({ data: state.rpcData, error: null }));
    database.order.mockImplementation(async () => ({ data: state.photoRows, error: null }));
    database.limit.mockReturnValue({ order: database.order });
    database.is.mockReturnValue({ limit: database.limit });
    database.eq.mockReturnValue({ eq: database.eq, is: database.is, limit: database.limit });
    database.select.mockReturnValue({ eq: database.eq });
    database.from.mockReturnValue({ select: database.select });
    storage.sign.mockImplementation(async (_client, rows: Array<Record<string, unknown>>) =>
      rows.map((row) => row.is_private ? { ...row, url: privateSignedUrl } : row));
  });

  it("returns a strict allowlisted profile and locked private-photo placeholder to a non-entitled viewer", async () => {
    const response = await requestProfile();
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID).parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.profile).toMatchObject({ id: TARGET_ID, is_premium: true });
    expect(body.stats).toEqual({ photos_count: 2, friends_count: 3 });
    expect(body.photos.find((item) => item.id === PRIVATE_PHOTO_ID)).toMatchObject({
      access: "locked",
      url: null,
      thumbnail_url: null,
    });
    expect(storage.sign).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "storage_path",
      "storage_bucket",
      "thumbnail_storage_path",
      "reviewed_by",
      "stripe_customer_id",
      "push_tokens",
      "private_note",
      "meetings_count",
      "roles",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(database.eq).toHaveBeenCalledWith("approval_status", "approved");
    expect(database.is).toHaveBeenCalledWith("moderation_action", null);
  });

  it("returns no media URL while an approved row is still publishing", async () => {
    state.photoRows = [];

    const response = await requestProfile();
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID).parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.photos).toEqual([]);
    expect(body.featured_media).toEqual({ avatar: null, cover: null });
    expect(body.profile.avatar_url).toBeNull();
    expect(body.stats.photos_count).toBe(0);
    expect(database.is).toHaveBeenCalledWith("moderation_action", null);
  });

  it("omits location from room-surface profile responses", async () => {
    const response = await requestProfile("rooms");
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID, undefined, true).parse(await response.json());

    expect(response.status).toBe(200);
    expect(Object.hasOwn(body.profile, "location_text")).toBe(false);
    expect(Object.hasOwn(body.profile, "is_online")).toBe(false);
    expect(Object.hasOwn(body.profile, "last_seen_at")).toBe(false);
  });

  it("returns only a time-limited signed URL for entitled private media", async () => {
    state.subscriber = true;

    const response = await requestProfile();
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID).parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.photos.find((item) => item.id === PRIVATE_PHOTO_ID)).toMatchObject({
      access: "viewable",
      url: privateSignedUrl,
    });
    expect(storage.sign).toHaveBeenCalledOnce();
  });

  it("ignores stale raw avatar and cover strings when no approved featured row matches", async () => {
    state.rpcData = rpcPayload({
      ...profile,
      avatar_url: "https://evil.example/stale-avatar.jpg",
      cover_image_url: "https://evil.example/stale-cover.jpg",
    });
    state.photoRows = [{ ...photo(PUBLIC_PHOTO_ID, false), is_avatar: false }];

    const response = await requestProfile();
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID, storageOrigin).parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.profile.avatar_url).toBeNull();
    expect(body.profile.cover_image_url).toBeNull();
    expect(body.featured_media).toEqual({ avatar: null, cover: null });
  });

  it("derives an approved cover independently of the raw profile cover string", async () => {
    state.photoRows = [{
      ...photo(PUBLIC_PHOTO_ID, false),
      is_avatar: false,
      is_cover: true,
    }];

    const response = await requestProfile();
    const body = publicProfileResponseSchemaFor(VIEWER_ID, TARGET_ID, storageOrigin).parse(await response.json());

    expect(body.profile.avatar_url).toBeNull();
    expect(body.profile.cover_image_url).toBe(state.photoRows[0].url);
    expect(body.featured_media.cover?.id).toBe(PUBLIC_PHOTO_ID);
  });

  it.each([
    ["blocked", () => { state.blocked = true; }],
    ["deleted", () => { state.rpcData = rpcPayload({ ...profile, deleted_at: timestamp }); }],
    ["missing", () => { state.rpcData = { error: "database detail", profile: null }; }],
  ])("uses indistinguishable not-found semantics for %s targets", async (_case, setup) => {
    setup();

    const response = await requestProfile();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "USER_NOT_FOUND",
      message: "Profile not found",
    });
  });

  it.each([
    ["wrong private flag", { ...photo(PRIVATE_PHOTO_ID, true), is_private: "true" }],
    ["unapproved row", { ...photo(PRIVATE_PHOTO_ID, true), approval_status: "pending" }],
    ["foreign owner", { ...photo(PRIVATE_PHOTO_ID, true), user_id: VIEWER_ID }],
  ])("fails closed when the database returns a %s", async (_case, malformedPhoto) => {
    state.photoRows = [malformedPhoto];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestProfile();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({ code: "PROFILE_FETCH_FAILED" });
    expect(JSON.stringify(payload)).not.toContain("storage_path");
  });
});

function requestProfile(surface?: string) {
  return GET(
    new Request(`https://example.test/api/profile/${TARGET_ID}?limit=100${surface ? `&surface=${surface}` : ""}`),
    { params: Promise.resolve({ userId: TARGET_ID }) } as never,
  );
}
