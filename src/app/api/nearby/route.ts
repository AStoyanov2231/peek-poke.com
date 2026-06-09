import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { coordsSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import type { NearbyUser } from "@/types/database";

export const POST = withAuth(async (request, { supabase }) => {
  const [body, err] = await parseBody(request, coordsSchema);
  if (err) return err;

  const { data, error } = await supabase.rpc("nearby_users", {
    p_lat: body.lat,
    p_lng: body.lng,
    p_radius_km: 2,
  });

  if (error) {
    console.error("nearby:", error);
    return apiError("Internal server error", 500, "NEARBY_FETCH_FAILED");
  }

  const users: NearbyUser[] = (data ?? []).map((row: {
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
    lat: Math.round(row.lat * 1000) / 1000,
    lng: Math.round(row.lng * 1000) / 1000,
  }));

  return NextResponse.json({ users });
});
