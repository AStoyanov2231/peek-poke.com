import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { NearbyUser } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { lat?: unknown; lng?: unknown };
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("nearby_users", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: 2,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    lat: row.lat,
    lng: row.lng,
  }));

  return NextResponse.json({ users });
}
