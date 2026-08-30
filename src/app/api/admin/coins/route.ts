import { NextRequest, NextResponse } from "next/server";
import { withAuth, requireAdminRole } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";
import { coordsSchema, parseBody } from "@/lib/validators";
import { createServiceClient } from "@/lib/supabase/server";

export const GET = withAuth(async (_req: NextRequest, { user, supabase }) => {
  const denied = await requireAdminRole(supabase, user.id);
  if (denied) return denied;

  const { data, error } = await createServiceClient()
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

  const limited = await enforceRateLimit("adminCoins", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(req, coordsSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient()
    .from("admin_coins")
    .insert({ lat: body.lat, lng: body.lng, created_by: user.id })
    .select("id, lat, lng, created_at")
    .single();

  if (error) {
    console.error("admin/coins POST:", error);
    return apiError("Failed to place coin", 500);
  }
  return NextResponse.json(data, { status: 201 });
});
