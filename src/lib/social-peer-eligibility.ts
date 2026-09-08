import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const peerIdsSchema = z.array(z.uuid()).max(101);

export type PeerEligibilityResult =
  | { eligible: true; unavailable?: never }
  | { eligible: false; unavailable?: never }
  | { eligible?: never; unavailable: true };

/**
 * Checks the complete server-side social boundary for a pair.
 *
 * The database owns the admission, account-liveness, and bidirectional-block
 * decision.  A malformed or unavailable result is deliberately not treated as
 * a negative eligibility result: callers can distinguish it and fail closed.
 */
export async function canInteractWithSocialPeer(
  viewerId: string,
  peerId: string,
): Promise<PeerEligibilityResult> {
  if (viewerId === peerId) return { eligible: true };
  const { data, error } = await createServiceClient().rpc("can_users_interact_v1", {
    p_user_a: viewerId,
    p_user_b: peerId,
  });
  if (error || typeof data !== "boolean") return { unavailable: true };
  return { eligible: data };
}

/**
 * Uses one server-only RPC for bounded social lists instead of per-profile
 * checks.  The RPC returns only a subset of the submitted candidate IDs.
 */
export async function filterEligibleSocialPeerIds(
  viewerId: string,
  candidateIds: readonly string[],
): Promise<{ ids: Set<string>; unavailable?: never } | { ids?: never; unavailable: true }> {
  const uniqueIds = [...new Set(candidateIds.filter((id) => id !== viewerId))];
  const candidates = peerIdsSchema.safeParse(uniqueIds);
  if (!candidates.success) return { unavailable: true };
  if (candidates.data.length === 0) return { ids: new Set() };

  const { data, error } = await createServiceClient().rpc(
    "filter_adult_social_peers_v1",
    {
      p_user_id: viewerId,
      p_peer_ids: candidates.data,
    },
  );
  const parsed = peerIdsSchema.safeParse(data);
  if (
    error
    || !parsed.success
    || new Set(parsed.data).size !== parsed.data.length
    || parsed.data.some((id) => !candidates.data.includes(id))
  ) return { unavailable: true };
  return { ids: new Set(parsed.data) };
}
