import { beforeEach, describe, expect, it, vi } from "vitest";

const MODERATOR_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ data: null as Record<string, unknown> | null }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) => handler(
      request,
      {
        user: { id: MODERATOR_ID },
        supabase: {},
        params: routeContext?.params ? await routeContext.params : {},
      },
    ),
  requireModeratorRole: vi.fn(async () => null),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/storage-urls", () => ({
  signPrivateProfilePhotos: vi.fn(async (_client, photos: unknown[]) => photos),
}));

import { POST } from "@/app/api/moderation/photos/[photoId]/repair/route";

const photo = {
  id: PHOTO_ID,
  user_id: OWNER_ID,
  storage_path: `${OWNER_ID}/photo.jpg`,
  storage_bucket: "profile-media-quarantine",
  thumbnail_storage_path: null,
  url: "https://storage.invalid/photo.jpg",
  thumbnail_url: null,
  is_avatar: false,
  is_cover: false,
  is_private: false,
  display_order: 0,
  created_at: "2026-08-08T00:00:00.000Z",
  approval_status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
};

describe("profile media operator remediation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = null;
    rpc.mockImplementation(async () => ({ data: state.data, error: null }));
  });

  it("reconstructs preserved exact work and returns accepted only with queue proof", async () => {
    state.data = {
      ...photo,
      moderation_action: "approve",
      _moderation_queue_state: "pending",
      _remediation_state: "reconstructed",
    };

    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reconstruct",
      note: "Verified exact preserved payload",
    });

    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("resolve_profile_media_remediation", {
      p_photo_id: PHOTO_ID,
      p_operation_id: OPERATION_ID,
      p_operator_id: MODERATOR_ID,
      p_resolution: "reconstruct",
      p_note: "Verified exact preserved payload",
    });
    await expect(response.json()).resolves.toMatchObject({ remediation_state: "reconstructed" });
  });

  it("accepts an explicit noted decision reset without claiming media work", async () => {
    state.data = {
      ...photo,
      moderation_action: null,
      _remediation_state: "decision_reset",
    };

    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reset",
      note: "Payload cannot be reconstructed safely",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remediation_state: "decision_reset" });
  });

  it("accepts a replayed reconstruction that already reached a safe terminal state", async () => {
    state.data = {
      ...photo,
      approval_status: "approved",
      moderation_action: null,
      _moderation_queue_state: "finalized",
      _remediation_state: "reconstructed",
      _remediation_replayed: true,
    };

    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reconstruct",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remediation_state: "reconstructed" });
  });

  it.each([
    "REMEDIATION_SNAPSHOT_MISSING",
    "REMEDIATION_SNAPSHOT_DIGEST_MISMATCH",
    "REMEDIATION_PAYLOAD_INVALID",
    "REMEDIATION_ALREADY_RESOLVED",
  ])("preserves the actionable database error %s", async (code) => {
    state.data = { error: code, status: 409 };

    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reconstruct",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("requires an audit note before resetting a moderator decision", async () => {
    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reset",
    });

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when reconstruction does not return claimable proof", async () => {
    state.data = {
      ...photo,
      moderation_action: "approve",
      _remediation_state: "reconstructed",
    };

    const response = await requestRepair({
      operation_id: OPERATION_ID,
      resolution: "reconstruct",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "MEDIA_REMEDIATION_FAILED" });
  });
});

function requestRepair(body: Record<string, unknown>) {
  return POST(
    new Request(`https://example.test/api/moderation/photos/${PHOTO_ID}/repair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ photoId: PHOTO_ID }) } as never,
  );
}
