import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteProfilePhoto,
  fetchProfilePhotos,
  fetchPublicProfile as fetchProfileScreenProfile,
  updateProfilePhoto,
  uploadProfileCover,
  uploadProfilePhoto,
} from "@/data/profile/api";
import { fetchPublicProfile as fetchDiscoveryProfile } from "@/data/discovery/api";
import { nativeQueryKeys } from "@/data/query-keys";

const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-07T10:00:00.000Z";
const page = { version: "v1", next_cursor: null, has_more: false, limit: 100 } as const;

const ownerPhoto = {
  id: PHOTO_ID,
  user_id: TARGET_ID,
  url: `https://project.supabase.co/storage/v1/object/public/profile-photos/${TARGET_ID}/photo.jpg`,
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

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

vi.mock("@/lib/env", () => ({
  env: {
    apiBaseUrl: "https://www.peek-poke.com",
    supabaseUrl: "https://project.supabase.co",
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe("native profile-photo transport", () => {
  it.each([
    ["storage path", { ...ownerPhoto, storage_path: "secret" }],
    ["storage bucket", { ...ownerPhoto, storage_bucket: "private-profile-photos" }],
    ["review identity", { ...ownerPhoto, reviewed_by: TARGET_ID }],
    ["unsafe URL", { ...ownerPhoto, url: "file:///private/photo.jpg" }],
    ["foreign media origin", { ...ownerPhoto, url: "https://evil.example/profile.jpg" }],
  ])("rejects owner-photo %s leakage before the native cache on both platform suites", async (_case, leakedPhoto) => {
    vi.stubGlobal("fetch", response({ photos: [leakedPhoto], pagination: page }));
    const client = noRetryClient();

    await expect(client.fetchQuery({
      queryKey: nativeQueryKeys.profile.photos,
      queryFn: fetchProfilePhotos,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(client.getQueryData(nativeQueryKeys.profile.photos)).toBeUndefined();
  });

  it.each([
    ["profile secret", { ...publicProfile, profile: { ...publicProfile.profile, deleted_at: timestamp } }],
    ["photo path", { ...publicProfile, photos: [{ ...publicProfile.photos[0], thumbnail_storage_path: "secret" }] }],
    ["locked media URL", { ...publicProfile, photos: [{ ...publicProfile.photos[0], is_private: true, access: "locked", url: ownerPhoto.url }] }],
    ["foreign media origin", { ...publicProfile, photos: [{ ...publicProfile.photos[0], url: "https://evil.example/profile.jpg" }] }],
    ["target mismatch", { ...publicProfile, profile: { ...publicProfile.profile, id: PHOTO_ID } }],
  ])("rejects public-profile %s leakage before both native consumer caches", async (_case, payload) => {
    for (const [consumer, read] of [
      ["profile", () => fetchProfileScreenProfile(TARGET_ID)],
      ["discovery", () => fetchDiscoveryProfile(TARGET_ID)],
    ] as const) {
      vi.stubGlobal("fetch", response(payload));
      const client = noRetryClient();
      const queryKey = ["profile-contract", consumer] as const;

      await expect(client.fetchQuery({ queryKey, queryFn: read })).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        status: 502,
      });
      expect(client.getQueryData(queryKey)).toBeUndefined();
    }
  });

  it("does not run a native upload commit callback for a leaked 2xx photo", async () => {
    vi.stubGlobal("fetch", response({ photo: { ...ownerPhoto, storage_path: "secret" } }));
    const committed: unknown[] = [];

    await expect(uploadProfilePhoto(new FormData()).then((photo) => committed.push(photo)))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    expect(committed).toEqual([]);
  });

  it("parses a pending cover without promoting it into the public profile", async () => {
    const pendingCover = {
      ...ownerPhoto,
      is_cover: true,
      approval_status: "pending" as const,
      url: `https://project.supabase.co/storage/v1/object/sign/profile-media-quarantine/${TARGET_ID}/photo.jpg?token=signed-token`,
    };
    vi.stubGlobal("fetch", response({ photo: pendingCover }));

    await expect(uploadProfileCover(new FormData())).resolves.toEqual(pendingCover);
    expect(publicProfile.profile.cover_image_url).toBeNull();
  });

  it("recovers on iOS and Android refetch after publication completes", async () => {
    const publishing = {
      ...publicProfile,
      photos: [],
      stats: { ...publicProfile.stats, photos_count: 0 },
    };

    for (const read of [
      () => fetchProfileScreenProfile(TARGET_ID),
      () => fetchDiscoveryProfile(TARGET_ID),
    ]) {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse(publishing))
        .mockResolvedValueOnce(jsonResponse(publicProfile));
      vi.stubGlobal("fetch", fetchMock);

      await expect(read()).resolves.toMatchObject({ photos: [] });
      await expect(read()).resolves.toMatchObject({
        photos: [expect.objectContaining({ id: PHOTO_ID, url: ownerPhoto.url })],
      });
    }
  });

  it("accepts exact owner mutations in the iOS and Android transport suites", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ photo: ownerPhoto }))
      .mockResolvedValueOnce(jsonResponse({ photo: { ...ownerPhoto, is_private: true, url: privateUrl() } }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadProfilePhoto(new FormData())).resolves.toEqual(ownerPhoto);
    await expect(updateProfilePhoto(PHOTO_ID, { is_private: true })).resolves.toMatchObject({
      id: PHOTO_ID,
      is_private: true,
      url: privateUrl(),
    });
    await expect(deleteProfilePhoto(PHOTO_ID)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://www.peek-poke.com/api/profile/photos/${PHOTO_ID}`,
    );
  });
});

function privateUrl() {
  return `https://project.supabase.co/storage/v1/object/sign/private-profile-photos/${TARGET_ID}/photo.jpg?token=signed-token`;
}

function response(payload: unknown) {
  return vi.fn(async () => jsonResponse(payload));
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "x-request-id": "profile-native-request" },
  });
}

function noRetryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
