import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerProfilePhotoMutationResponseSchemaFor } from "@peekpoke/shared";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-07T10:00:00.000Z";
const storageOrigin = "https://project.supabase.co";
const signedUrl = `${storageOrigin}/storage/v1/object/sign/profile-media-quarantine/${USER_ID}/cover.jpg?token=signed-token`;

const database = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, { user: { id: USER_ID } }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/upload", () => ({
  imageExtension: vi.fn(() => "jpg"),
  normalizeImageFile: vi.fn(async (file: File) => ({ file })),
  parseBoundedFormData: vi.fn((request: Request) => request.formData()),
  validateImageFile: vi.fn(async () => null),
  validateUploadBodySize: vi.fn(() => null),
  uploadFile: vi.fn(async () => ({ url: signedUrl })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: database.from,
    storage: { from: database.storageFrom },
  }),
}));

import { POST } from "@/app/api/profile/cover/route";

describe("profile cover moderation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", storageOrigin);
    database.remove.mockResolvedValue({ error: null });
    database.createSignedUrl.mockImplementation(async () => ({ data: { signedUrl }, error: null }));
    database.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `${storageOrigin}/storage/v1/object/public/profile-media-quarantine/${path}` },
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
            id: PHOTO_ID,
            created_at: timestamp,
            reviewed_by: null,
            reviewed_at: null,
            rejection_reason: null,
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
                limit: () => ({ single: async () => ({ data: { display_order: 1 } }) }),
              }),
            }),
          },
      insert: database.insert,
    });
  });

  it("queues a canonical pending cover photo and does not return an active cover URL", async () => {
    const formData = new FormData();
    formData.append("file", new File(["image"], "cover.jpg", { type: "image/jpeg" }));

    const response = await POST(new Request("https://example.test/api/profile/cover", {
      method: "POST",
      body: formData,
    }), {} as never);
    const body = ownerProfilePhotoMutationResponseSchemaFor(USER_ID, storageOrigin).parse(await response.json());

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.photo).toMatchObject({
      id: PHOTO_ID,
      is_cover: true,
      is_avatar: false,
      is_private: false,
      approval_status: "pending",
      url: signedUrl,
    });
    expect(database.insert).toHaveBeenCalledWith(expect.objectContaining({
      storage_bucket: "profile-media-quarantine",
      is_cover: true,
      approval_status: "pending",
    }));
    expect(database.from).not.toHaveBeenCalledWith("profiles");
  });
});
