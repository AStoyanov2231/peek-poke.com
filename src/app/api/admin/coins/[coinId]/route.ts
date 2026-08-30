import { NextRequest, NextResponse } from "next/server";
import { withAuth, requireAdminRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const DELETE = withAuth<{ coinId: string }>(async (_req: NextRequest, { user, supabase, params }) => {
  const denied = await requireAdminRole(supabase, user.id);
  if (denied) return denied;

  const limited = await enforceRateLimit("adminCoins", user.id);
  if (limited) return limited;

  const { coinId } = params;
  if (!isValidUUID(coinId)) return apiError("Invalid coin ID", 400, "INVALID_PARAMS");

  const { error } = await createServiceClient()
    .from("admin_coins")
    .delete()
    .eq("id", coinId);

  if (error) return apiError("Failed to delete coin", 500);
  return new NextResponse(null, { status: 204 });
});
