import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerProfilePhotosResponseSchema } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-07T10:00:00.000Z";
const storageOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://project.supabase.co").replace(/\/$/, "");
const privateSignedUrl = `${storageOrigin}/storage/v1/object/sign/private-profile-photos/${USER_ID}/photo.jpg?token=signed-token`;

const database = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
  order: vi.fn(),
}));

const storage = vi.hoisted(() => ({ sign: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: database.from }),
}));

vi.mock("@/lib/storage-urls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage-urls")>("@/lib/storage-urls");
  return { ...actual, signPrivateProfilePhotos: storage.sign };
});

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { GET } from "@/app/api/profile/photos/route";

const rawPhoto = {
  id: PHOTO_ID,
  user_id: USER_ID,
  storage_path: `${USER_ID}/photo.jpg`,
  storage_bucket: "private-profile-photos",
  thumbnail_storage_path: null,
  url: `${storageOrigin}/storage/v1/object/public/private-profile-photos/${USER_ID}/photo.jpg`,
  thumbnail_url: null,
  is_avatar: false,
  is_cover: false,
  is_private: true,
  display_order: 0,
  created_at: timestamp,
  approval_status: "approved",
  reviewed_by: USER_ID,
  reviewed_at: timestamp,
  rejection_reason: null,
  database_only: "secret",
};

describe("owner profile-photo read route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", storageOrigin);
    database.rows = [rawPhoto];
    database.order.mockImplementation(async () => ({ data: database.rows, error: null }));
    database.limit.mockReturnValue({ order: database.order });
    database.eq.mockReturnValue({ limit: database.limit });
    database.select.mockReturnValue({ eq: database.eq });
    database.from.mockReturnValue({ select: database.select });
    storage.sign.mockImplementation(async (_client, rows: Array<Record<string, unknown>>) =>
      rows.map((row) => ({ ...row, url: privateSignedUrl })));
  });

  it("returns signed owner media through an exact storage-free contract", async () => {
    const response = await GET(new Request("https://example.test/api/profile/photos?limit=100"), {} as never);
    const body = ownerProfilePhotosResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.photos[0]).toMatchObject({ id: PHOTO_ID, url: privateSignedUrl });
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "storage_path",
      "storage_bucket",
      "thumbnail_storage_path",
      "reviewed_by",
      "reviewed_at",
      "database_only",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(database.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("fails closed rather than returning a stored public-looking private URL when signing fails", async () => {
    storage.sign.mockImplementationOnce(async (_client, rows: Array<Record<string, unknown>>) => rows);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://example.test/api/profile/photos?limit=100"), {} as never);

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "PHOTOS_FETCH_FAILED" });
  });

  it("fails closed on malformed owner identity instead of caching cross-owner media", async () => {
    database.rows = [{ ...rawPhoto, user_id: PHOTO_ID }];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://example.test/api/profile/photos?limit=100"), {} as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "PHOTOS_FETCH_FAILED" });
  });
});
