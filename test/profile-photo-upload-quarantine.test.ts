import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerProfilePhotoMutationResponseSchemaFor } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-08-07T10:00:00.000Z";
const storageOrigin = "https://project.supabase.co";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));
const upload = vi.hoisted(() => ({
  file: vi.fn(),
  thumbnail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/account-storage-write", () => ({
  AccountStorageWriteError: class AccountStorageWriteError extends Error {},
  runAccountStorageWrite: async (_client: unknown, _userId: string, _kind: string, work: () => Promise<unknown>) => work(),
}));
vi.mock("@/lib/upload", () => ({
  imageExtension: vi.fn(() => "jpg"),
  normalizeImageFile: vi.fn(async (file: File) => ({ file })),
  parseBoundedFormData: vi.fn((request: Request) => request.formData()),
  validateImageFile: vi.fn(async () => null),
  validateThumbnail: vi.fn(async () => null),
  validateUploadBodySize: vi.fn(() => null),
  uploadFile: upload.file,
  uploadThumbnail: upload.thumbnail,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: database.from,
    storage: { from: database.storageFrom },
  }),
}));

import { POST } from "@/app/api/profile/photos/route";

describe("profile gallery upload quarantine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", storageOrigin);
    upload.file.mockResolvedValue({ url: "signed-main" });
    upload.thumbnail.mockResolvedValue("signed-thumbnail");
    database.remove.mockResolvedValue({ error: null });
    database.createSignedUrl.mockImplementation(async (path: string) => ({
      data: {
        signedUrl: `${storageOrigin}/storage/v1/object/sign/profile-media-quarantine/${path}?token=signed-token`,
      },
      error: null,
    }));
    database.getPublicUrl.mockImplementation((path: string) => ({
      data: {
        publicUrl: `${storageOrigin}/storage/v1/object/public/profile-media-quarantine/${path}`,
      },
    }));
    database.storageFrom.mockReturnValue({
      remove: database.remove,
      createSignedUrl: database.createSignedUrl,
      getPublicUrl: database.getPublicUrl,
    });
    database.insert.mockImplementation((values: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: {
            ...values,
            created_at: timestamp,
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: null,
            is_avatar: false,
            is_cover: false,
          },
          error: null,
        }),
      }),
    }));
    database.from.mockReturnValue({
      select: (_columns: string, options?: { head?: boolean }) => options?.head
        ? { eq: async () => ({ count: 0 }) }
        : {
            eq: () => ({
              order: () => ({
                limit: () => ({ single: async () => ({ data: { display_order: 0 } }) }),
              }),
            }),
          },
      insert: database.insert,
    });
  });

  it("stores public-intent main and thumbnail objects privately until moderation", async () => {
    const formData = new FormData();
    formData.append("file", new File(["image"], "photo.jpg", { type: "image/jpeg" }));
    formData.append("thumbnail", new File(["thumb"], "thumb.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("https://example.test/api/profile/photos", {
      method: "POST",
      body: formData,
    }), {} as never);
    const body = ownerProfilePhotoMutationResponseSchemaFor(USER_ID, storageOrigin)
      .parse(await response.json());

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.photo).toMatchObject({
      user_id: USER_ID,
      approval_status: "pending",
      is_private: false,
    });
    expect(body.photo.url).toMatch(
      new RegExp(`/storage/v1/object/sign/profile-media-quarantine/${USER_ID}/`),
    );
    expect(body.photo.thumbnail_url).toMatch(
      new RegExp(`/storage/v1/object/sign/profile-media-quarantine/${USER_ID}/`),
    );
    expect(upload.file).toHaveBeenCalledWith(
      expect.anything(),
      "profile-media-quarantine",
      expect.stringMatching(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`)),
      expect.any(File),
      { public: false },
    );
    expect(upload.thumbnail).toHaveBeenCalledWith(
      expect.anything(),
      "profile-media-quarantine",
      expect.stringMatching(new RegExp(`^${USER_ID}/[0-9a-f-]+_thumb\\.jpg$`)),
      expect.any(File),
      "profile/photos",
      { public: false },
    );
    expect(database.insert).toHaveBeenCalledWith(expect.objectContaining({
      storage_bucket: "profile-media-quarantine",
      approval_status: "pending",
      thumbnail_url: null,
    }));
  });
});
