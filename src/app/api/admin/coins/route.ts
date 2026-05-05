import { NextRequest, NextResponse } from "next/server";
import { withAuth, requireAdminRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_req: NextRequest, { user, supabase }) => {
  const denied = await requireAdminRole(supabase, user.id);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("admin_coins")
    .select("id, lat, lng, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin/coins GET:", error);
    return apiError("Failed to fetch coins", 500);
  }
  return NextResponse.json(data);
});

export const POST = withAuth(async (req: NextRequest, { user, supabase }) => {
  const denied = await requireAdminRole(supabase, user.id);
  if (denied) return denied;

  const body = await req.json();
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return apiError("Valid lat and lng required", 400, "INVALID_PARAMS");
  }

  const { data, error } = await supabase
    .from("admin_coins")
    .insert({ lat, lng, created_by: user.id })
    .select("id, lat, lng, created_at")
    .single();

  if (error) {
    console.error("admin/coins POST:", error);
    return apiError("Failed to place coin", 500);
  }
  return NextResponse.json(data, { status: 201 });
});
