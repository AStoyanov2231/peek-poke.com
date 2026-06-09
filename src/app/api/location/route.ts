import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { coordsSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (request, { user, supabase }) => {
  const limited = await enforceRateLimit("location", user.id);
  if (limited) return limited;

  const [body, err] = await parseBody(request, coordsSchema);
  if (err) return err;

  const { error } = await supabase
    .from("user_locations")
    .upsert({ user_id: user.id, lat: body.lat, lng: body.lng, updated_at: new Date().toISOString() });

  if (error) {
    console.error("location:", error);
    return apiError("Internal server error", 500, "LOCATION_UPDATE_FAILED");
  }

  return NextResponse.json({ ok: true });
});
