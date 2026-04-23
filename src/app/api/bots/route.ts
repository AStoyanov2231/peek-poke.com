import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (request, { user: _, supabase }) => {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  if (isNaN(lat) || isNaN(lng)) return apiError("lat and lng required", 400, "INVALID_PARAMS");

  const { data, error } = await supabase.rpc("spawn_coin_bots", { p_lat: lat, p_lng: lng });
  if (error) {
    console.error("bots/GET:", error);
    return apiError("Internal server error", 500, "BOTS_FETCH_FAILED");
  }
  return NextResponse.json((data as { id: string; lat: number; lng: number }[]).map(b => ({ id: b.id, lat: b.lat, lng: b.lng })));
});

export const POST = withAuth(async (request, { user: _, supabase }) => {
  const body = await request.json();
  const { id, lat, lng } = body;
  if (!id || isNaN(lat) || isNaN(lng)) return apiError("id, lat, lng required", 400, "INVALID_PARAMS");

  const { data, error } = await supabase.rpc("collect_coin_bot", { p_bot_id: id, p_lat: lat, p_lng: lng });
  if (error) {
    console.error("bots/POST:", error);
    return apiError("Internal server error", 500, "BOT_COLLECT_FAILED");
  }
  return NextResponse.json(data);
});
