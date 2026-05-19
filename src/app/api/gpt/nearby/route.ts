import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const supabase = createServiceClient();

  // Use the user's last reported location
  const { data: loc } = await supabase
    .from("user_locations")
    .select("lat, lng")
    .eq("user_id", auth.userId)
    .single();

  if (!loc) {
    return NextResponse.json(
      { error: "No location on file. Open the Peek & Poke app to share your location first." },
      { status: 404 }
    );
  }

  const { data, error } = await supabase.rpc("nearby_users", {
    p_lat: loc.lat,
    p_lng: loc.lng,
    p_radius_km: 2,
  });

  if (error) {
    console.error("gpt/nearby:", error);
    return apiError("Failed to fetch nearby users", 500, "NEARBY_FETCH_FAILED");
  }

  const users = (data ?? []).map((row: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    lat: number;
    lng: number;
  }) => ({
    userId: row.user_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
  }));

  return NextResponse.json({ users });
}
