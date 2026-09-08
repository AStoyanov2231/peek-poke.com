import { NextResponse } from "next/server";
import { profileSocialContextResponseSchema } from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";
import { withAuth } from "@/lib/auth";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";

export const GET = withNoStore(withAuth<{ userId: string }>(async (_request, { user, params }) => {
  if (!isValidUUID(params.userId)) return apiError("Invalid user ID", 400, "INVALID_USER_ID");
  const limited = await enforceRateLimit("profileSocialContext", user.id);
  if (limited) return limited;

  const { data, error } = await createServiceClient().rpc("get_profile_social_context", {
    p_viewer_id: user.id,
    p_target_id: params.userId,
  });
  if (error) {
    console.error("profile social context:", error);
    return apiError("Profile context is temporarily unavailable", 503, "PROFILE_CONTEXT_UNAVAILABLE");
  }
  if (typeof data === "object" && data !== null && "error" in data) {
    return apiError("Profile not found", 404, "USER_NOT_FOUND");
  }
  const parsed = profileSocialContextResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error("profile social context: invalid RPC response", parsed.error.flatten());
    return apiError("Profile context is temporarily unavailable", 503, "PROFILE_CONTEXT_UNAVAILABLE");
  }
  return NextResponse.json(parsed.data);
}));
