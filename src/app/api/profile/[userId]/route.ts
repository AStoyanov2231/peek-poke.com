import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export const GET = withAuth<{ userId: string }>(async (_request, { user, supabase, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId)) {
    return apiError("Invalid user ID", 400, "INVALID_USER_ID");
  }

  const { data, error } = await supabase.rpc("get_user_profile", {
    p_target_id: userId,
    p_viewer_id: user.id,
  });

  if (error) {
    console.error("profile/[userId]:", error);
    return apiError("Internal server error", 500, "PROFILE_FETCH_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, 404, "USER_NOT_FOUND");
  }

  return NextResponse.json(data);
});
