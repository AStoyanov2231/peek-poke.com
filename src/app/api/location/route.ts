import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { coordsSchema, parseBody } from "@/lib/validators";

// Permissioned device coordinates support approximate discovery only. They are
// never proof of a meetup or an input to coin/reward authorization.
export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("location", user.id);
  if (limited) return limited;

  const [coords, bodyError] = await parseBody(request, coordsSchema);
  if (bodyError) return bodyError;

  const { error } = await createServiceClient()
    .from("user_locations")
    .upsert({
      user_id: user.id,
      lat: coords.lat,
      lng: coords.lng,
      // Server receipt time is the trust boundary for the ten-minute discovery
      // window. A client-captured timestamp is not an authorization signal.
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (error) {
    console.error("location/POST:", error);
    return apiError("Location update is temporarily unavailable", 503, "LOCATION_UNAVAILABLE");
  }
  return Response.json({ ok: true });
}));
