import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { coordsSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (request, { user, supabase }) => {
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
