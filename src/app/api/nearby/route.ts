import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { coordsSchema, parseBody } from "@/lib/validators";
import { nearbyResponseSchemaForViewer } from "@peekpoke/shared";

// The body proves only that this is a well-formed discovery request. The
// server reads the viewer's short-lived persisted location and returns only
// coarse cells from the bounded RPC. Client coordinates never authorize a
// meeting reward.
export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("nearby", user.id);
  if (limited) return limited;

  const [, bodyError] = await parseBody(request, coordsSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("nearby_users_for_user", {
    p_user_id: user.id,
    p_radius_km: 2,
  });
  if (error || !Array.isArray(data)) {
    console.error("nearby/POST:", error ?? "malformed RPC response");
    return apiError("Nearby discovery is temporarily unavailable", 503, "NEARBY_UNAVAILABLE");
  }

  const users = data.map((row) => ({
    userId: row.user_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    is_online: row.is_online,
    last_seen_at: row.last_seen_at,
    lat: row.lat,
    lng: row.lng,
  }));
  const payload = nearbyResponseSchemaForViewer(
    user.id,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({ users });
  if (!payload.success) {
    console.error("nearby/POST: invalid RPC response", payload.error.flatten());
    return apiError("Nearby discovery is temporarily unavailable", 503, "NEARBY_UNAVAILABLE");
  }
  return Response.json(payload.data);
}));
