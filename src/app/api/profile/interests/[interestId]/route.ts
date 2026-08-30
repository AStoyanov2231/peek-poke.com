import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { profileInterestDeleteFilter } from "@/lib/interest-contract";
import { profileInterestDeleteResponseSchema } from "@peekpoke/shared";

export const DELETE = withAuth<{ interestId: string }>(async (_request, { user, params }) => {
  const { interestId } = params;

  if (!isValidUUID(interestId)) {
    return apiError("Invalid interest ID", 400, "INTEREST_NOT_FOUND");
  }

  const limited = await enforceRateLimit("profileMutation", user.id);
  if (limited) return limited;

  // Web onboarding sends tag_id; Expo sends profile_interests.id. Keep both
  // identifiers valid at the API boundary during the shared-contract rollout.
  const { error } = await createServiceClient()
    .from("profile_interests")
    .delete()
    .or(profileInterestDeleteFilter(interestId))
    .eq("user_id", user.id);

  if (error) {
    console.error("profile/interests/[interestId]:", error);
    return apiError("Internal server error", 500, "INTEREST_DELETE_FAILED");
  }

  return NextResponse.json(profileInterestDeleteResponseSchema.parse({ success: true }));
});
