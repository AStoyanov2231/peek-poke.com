import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export const DELETE = withAuth<{ interestId: string }>(async (_request, { user, supabase, params }) => {
  const { interestId } = params;

  if (!isValidUUID(interestId)) {
    return apiError("Invalid interest ID", 400, "INTEREST_NOT_FOUND");
  }

  // Delete by tag_id (interestId can be either tag_id or profile_interests.id)
  // First try tag_id, then fallback to id for backwards compatibility
  const { error } = await supabase
    .from("profile_interests")
    .delete()
    .eq("id", interestId)
    .eq("user_id", user.id);

  if (error) {
    console.error("profile/interests/[interestId]:", error);
    return apiError("Internal server error", 500, "INTEREST_DELETE_FAILED");
  }

  return NextResponse.json({ success: true });
});
