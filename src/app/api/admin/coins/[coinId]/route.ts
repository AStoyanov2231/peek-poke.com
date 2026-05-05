import { NextRequest, NextResponse } from "next/server";
import { withAuth, requireAdminRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const DELETE = withAuth<{ coinId: string }>(async (_req: NextRequest, { user, supabase, params }) => {
  const denied = await requireAdminRole(supabase, user.id);
  if (denied) return denied;

  const { coinId } = params;

  const { error } = await supabase
    .from("admin_coins")
    .delete()
    .eq("id", coinId);

  if (error) return apiError("Failed to delete coin", 500);
  return new NextResponse(null, { status: 204 });
});
