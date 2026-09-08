import { beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PEER_ID = "33333333-3333-4333-8333-333333333333";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: database.rpc }),
}));

import {
  canInteractWithSocialPeer,
  filterEligibleSocialPeerIds,
} from "@/lib/social-peer-eligibility";

describe("social peer eligibility boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the pair RPC and fails closed when it is unavailable or malformed", async () => {
    database.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(canInteractWithSocialPeer(VIEWER_ID, PEER_ID)).resolves.toEqual({ eligible: true });
    expect(database.rpc).toHaveBeenCalledWith("can_users_interact_v1", {
      p_user_a: VIEWER_ID,
      p_user_b: PEER_ID,
    });

    database.rpc.mockResolvedValueOnce({ data: "true", error: null });
    await expect(canInteractWithSocialPeer(VIEWER_ID, PEER_ID)).resolves.toEqual({ unavailable: true });
  });

  it("filters bounded lists through one RPC and rejects an injected result ID", async () => {
    database.rpc.mockResolvedValueOnce({ data: [PEER_ID], error: null });
    await expect(filterEligibleSocialPeerIds(VIEWER_ID, [PEER_ID, PEER_ID, OTHER_PEER_ID]))
      .resolves.toEqual({ ids: new Set([PEER_ID]) });
    expect(database.rpc).toHaveBeenCalledWith("filter_adult_social_peers_v1", {
      p_user_id: VIEWER_ID,
      p_peer_ids: [PEER_ID, OTHER_PEER_ID],
    });

    database.rpc.mockResolvedValueOnce({ data: ["44444444-4444-4444-8444-444444444444"], error: null });
    await expect(filterEligibleSocialPeerIds(VIEWER_ID, [PEER_ID]))
      .resolves.toEqual({ unavailable: true });
  });
});
