import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteOwnerProfilePhoto,
  photosQueryOptions,
  publicProfileQueryOptions,
  updateOwnerProfilePhoto,
  uploadOwnerProfileCover,
  uploadOwnerProfilePhoto,
  webQueryKeys,
} from "@/data/web-query";

const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-07T10:00:00.000Z";
const storageOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://project.supabase.co").replace(/\/$/, "");
const page = { version: "v1", next_cursor: null, has_more: false, limit: 100 } as const;

const ownerPhoto = {
  id: PHOTO_ID,
  user_id: TARGET_ID,
  url: `${storageOrigin}/storage/v1/object/public/profile-photos/${TARGET_ID}/photo.jpg`,
  thumbnail_url: null,
  is_avatar: false,
  is_cover: false,
  is_private: false,
  display_order: 0,
  created_at: timestamp,
  approval_status: "approved" as const,
  rejection_reason: null,
};

const publicProfile = {
  profile: {
    id: TARGET_ID,
    username: "target",
    display_name: "Target",
    bio: null,
    avatar_url: null,
    cover_image_url: null,
    location_text: null,
    is_online: true,
    last_seen_at: timestamp,
    created_at: timestamp,
    is_premium: false,
  },
  photos: [{
    id: PHOTO_ID,
    user_id: TARGET_ID,
    url: ownerPhoto.url,
    thumbnail_url: null,
    is_avatar: false,
    is_cover: false,
    is_private: false,
    display_order: 0,
    created_at: timestamp,
    approval_status: "approved" as const,
    access: "viewable" as const,
  }],
  featured_media: { avatar: null, cover: null },
  interests: [],
  stats: { photos_count: 1, friends_count: 0 },
  friendship: null,
  pagination: page,
};

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", storageOrigin));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("web profile-photo transport", () => {
  it.each([
    ["storage path", { ...ownerPhoto, storage_path: `${TARGET_ID}/photo.jpg` }],
    ["storage bucket", { ...ownerPhoto, storage_bucket: "private-profile-photos" }],
    ["review identity", { ...ownerPhoto, reviewed_by: TARGET_ID }],
    ["malformed URL", { ...ownerPhoto, url: "javascript:alert(1)" }],
    ["foreign media origin", { ...ownerPhoto, url: "https://evil.example/profile.jpg" }],
  ])("rejects an owner photo containing %s before QueryClient caching", async (_case, leakedPhoto) => {
    vi.stubGlobal("fetch", response({ photos: [leakedPhoto], pagination: page }));
    const client = noRetryClient();

    await expect(client.fetchQuery(photosQueryOptions)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(webQueryKeys.photos)).toBeUndefined();
  });

  it.each([
    ["profile secret", { ...publicProfile, profile: { ...publicProfile.profile, push_tokens: ["secret"] } }],
    ["photo storage metadata", { ...publicProfile, photos: [{ ...publicProfile.photos[0], storage_path: "secret" }] }],
    ["locked URL leak", { ...publicProfile, photos: [{ ...publicProfile.photos[0], is_private: true, access: "locked", url: ownerPhoto.url }] }],
    ["foreign photo origin", { ...publicProfile, photos: [{ ...publicProfile.photos[0], url: "https://evil.example/profile.jpg" }] }],
    ["foreign photo", { ...publicProfile, photos: [{ ...publicProfile.photos[0], user_id: PHOTO_ID }] }],
  ])("rejects a public profile with %s before target cache commit", async (_case, payload) => {
    vi.stubGlobal("fetch", response(payload));
    const client = noRetryClient();
    const options = publicProfileQueryOptions(TARGET_ID);

    await expect(client.fetchQuery(options)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    expect(client.getQueryData(webQueryKeys.publicProfile(TARGET_ID))).toBeUndefined();
  });

  it("does not run the upload commit callback when a 2xx mutation leaks storage metadata", async () => {
    vi.stubGlobal("fetch", response({ photo: { ...ownerPhoto, storage_path: "secret" } }));
    const committed: unknown[] = [];

    await expect(uploadOwnerProfilePhoto(new FormData()).then((photo) => committed.push(photo)))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(committed).toEqual([]);
  });

  it("parses a pending cover as owner media without fabricating an approved cover URL", async () => {
    const pendingCover = {
      ...ownerPhoto,
      is_cover: true,
      approval_status: "pending" as const,
      url: `${storageOrigin}/storage/v1/object/sign/profile-media-quarantine/${TARGET_ID}/photo.jpg?token=signed-token`,
    };
    vi.stubGlobal("fetch", response({ photo: pendingCover }));

    await expect(uploadOwnerProfileCover(new FormData())).resolves.toEqual(pendingCover);
    expect(publicProfile.profile.cover_image_url).toBeNull();
  });

  it("recovers from a publication-in-progress omission on the next web refetch", async () => {
    const publishing = {
      ...publicProfile,
      photos: [],
      stats: { ...publicProfile.stats, photos_count: 0 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(publishing))
      .mockResolvedValueOnce(jsonResponse(publicProfile));
    vi.stubGlobal("fetch", fetchMock);
    const client = noRetryClient();
    const options = publicProfileQueryOptions(TARGET_ID);

    await expect(client.fetchQuery(options)).resolves.toMatchObject({ photos: [] });
    await client.invalidateQueries({ queryKey: webQueryKeys.publicProfile(TARGET_ID) });
    await expect(client.fetchQuery(options)).resolves.toMatchObject({
      photos: [expect.objectContaining({ id: PHOTO_ID, url: ownerPhoto.url })],
    });
  });

  it("strictly parses valid upload, update, and delete responses and uses encoded owner paths", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ photo: ownerPhoto }))
      .mockResolvedValueOnce(jsonResponse({ photo: { ...ownerPhoto, is_private: true, url: privateUrl() } }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadOwnerProfilePhoto(new FormData())).resolves.toEqual(ownerPhoto);
    await expect(updateOwnerProfilePhoto(PHOTO_ID, { is_private: true })).resolves.toMatchObject({
      id: PHOTO_ID,
      is_private: true,
      url: privateUrl(),
    });
    await expect(deleteOwnerProfilePhoto(PHOTO_ID)).resolves.toEqual({ success: true });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/profile/photos/${PHOTO_ID}`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/profile/photos/${PHOTO_ID}`);
  });
});

function privateUrl() {
  return `${storageOrigin}/storage/v1/object/sign/private-profile-photos/${TARGET_ID}/photo.jpg?token=signed-token`;
}

function response(payload: unknown) {
  return vi.fn(async () => jsonResponse(payload));
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "profile-web-request" },
  });
}

function noRetryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
