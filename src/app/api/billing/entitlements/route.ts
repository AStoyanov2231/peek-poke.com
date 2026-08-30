import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user }) => {
  const serviceClient = createServiceClient();
  const { data: roles, error } = await serviceClient.rpc("get_user_roles", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("billing/entitlements:", error);
    return apiError("Internal server error", 500, "ENTITLEMENTS_FETCH_FAILED");
  }

  const normalizedRoles = Array.isArray(roles) ? roles : ["user"];

  return NextResponse.json({
    subscriber: normalizedRoles.includes("subscriber"),
    roles: normalizedRoles,
  });
});
