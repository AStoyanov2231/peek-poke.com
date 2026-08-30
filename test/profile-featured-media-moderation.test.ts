import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profilePatchSchema } from "@/lib/validators";

const MODERATOR_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-07T10:00:00.000Z";

const state = vi.hoisted(() => ({
  rpcData: null as Record<string, unknown> | null,
  rpcError: null as { code: string; message: string } | null,
}));
const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) => handler(request, {
      user: { id: MODERATOR_ID },
      supabase: {},
      params: routeContext?.params ? await routeContext.params : {},
    }),
  requireModeratorRole: vi.fn(async () => null),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/storage-urls", () => ({
  signPrivateProfilePhotos: vi.fn(async (_client, photos: unknown[]) => photos),
}));

import { PATCH } from "@/app/api/moderation/photos/[photoId]/route";
import { PATCH as PATCH_PROFILE } from "@/app/api/profile/route";

const rejectedFeaturedPhoto = {
  id: PHOTO_ID,
  user_id: OWNER_ID,
  storage_path: `${OWNER_ID}/avatar.jpg`,
  storage_bucket: "profile-photos",
  thumbnail_storage_path: null,
  url: `https://project.supabase.co/storage/v1/object/public/profile-photos/${OWNER_ID}/avatar.jpg`,
  thumbnail_url: null,
  is_avatar: false,
  is_cover: false,
  is_private: false,
  display_order: 0,
  created_at: timestamp,
  approval_status: "rejected",
  reviewed_by: MODERATOR_ID,
  reviewed_at: timestamp,
  rejection_reason: "Policy violation",
};

describe("featured profile media moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpcData = rejectedFeaturedPhoto;
    state.rpcError = null;
    rpc.mockImplementation(async () => ({ data: state.rpcData, error: state.rpcError }));
  });

  it("rejects direct avatar URL profile patches", () => {
    expect(profilePatchSchema.safeParse({ avatar_url: rejectedFeaturedPhoto.url }).success).toBe(false);
  });

  it("rejects the direct avatar URL API bypass before any database write", async () => {
    const response = await PATCH_PROFILE(new Request("https://example.test/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatar_url: rejectedFeaturedPhoto.url }),
    }), {} as never);

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the atomic moderation RPC and returns cleared featured flags after rejection", async () => {
    const response = await requestModeration({ action: "reject", reason: "Policy violation" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_profile_media_moderation", {
      p_photo_id: PHOTO_ID,
      p_reviewer_id: MODERATOR_ID,
      p_action: "reject",
      p_reason: "Policy violation",
    });
    expect(body.photo).toMatchObject({
      id: PHOTO_ID,
      approval_status: "rejected",
      is_avatar: false,
      is_cover: false,
    });
  });

  it("fails closed when the atomic moderation migration is unavailable", async () => {
    state.rpcError = { code: "PGRST202", message: "function not found" };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await requestModeration({ action: "approve" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "MODERATION_UNAVAILABLE" });
  });

  it.each(["pending", "processing"])(
    "returns accepted only when the RPC proves %s work exists",
    async (queueState) => {
      state.rpcData = {
        ...rejectedFeaturedPhoto,
        approval_status: "pending",
        moderation_action: "approve",
        _moderation_queue_state: queueState,
      };

      const response = await requestModeration({ action: "approve" });

      expect(response.status).toBe(202);
    },
  );

  it("does not report an active decision as queued without a live event proof", async () => {
    state.rpcData = {
      ...rejectedFeaturedPhoto,
      approval_status: "pending",
      moderation_action: "approve",
    };

    const response = await requestModeration({ action: "approve" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "MEDIA_EVENT_CONFLICT" });
  });

  it.each(["expired", "malformed", "delayed"])(
    "does not accept a %s queue marker as claimable work",
    async (queueState) => {
      state.rpcData = {
        ...rejectedFeaturedPhoto,
        approval_status: "pending",
        moderation_action: "approve",
        _moderation_queue_state: queueState,
      };

      const response = await requestModeration({ action: "approve" });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ code: "MEDIA_EVENT_CONFLICT" });
    },
  );

  it("surfaces a conflicting moderation event without claiming it was queued", async () => {
    state.rpcData = { error: "MEDIA_EVENT_CONFLICT", status: 409 };

    const response = await requestModeration({ action: "approve" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "MEDIA_EVENT_CONFLICT" });
  });

  it("surfaces quarantined corruption as an actionable remediation conflict", async () => {
    state.rpcData = {
      error: "MEDIA_REMEDIATION_REQUIRED",
      status: 409,
      operation_id: "44444444-4444-4444-8444-444444444444",
    };

    const response = await requestModeration({ action: "approve" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "MEDIA_REMEDIATION_REQUIRED",
      operation_id: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("contains DB guards for rejection, deletion, and concurrent profile writes", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20260807145740_enforce_approved_profile_media_references.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain("before insert or update");
    expect(sql).toContain("after insert or update or delete");
    expect(sql).toContain("for update");
    expect(sql).toContain("is_avatar = case when p_action = 'reject' then false");
    expect(sql).toContain("is_cover = case when p_action = 'reject' then false");
    expect(sql).toContain("revoke all on function public.moderate_profile_photo");
  });
});

function requestModeration(body: Record<string, unknown>) {
  return PATCH(
    new Request(`https://example.test/api/moderation/photos/${PHOTO_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ photoId: PHOTO_ID }) } as never,
  );
}
