import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { MIN_INTERESTS_REQUIRED } from "@/lib/constants";
import { isTemporaryUsername } from "@/lib/auth-profile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { onboardingCompleteResponseSchema } from "@peekpoke/shared";

const ONBOARDING_PROFILE_COLUMNS = "id, username, onboarding_completed";

export const POST = withAuth(async (_request, { user }) => {
  const limited = await enforceRateLimit("profileMutation", user.id);
  if (limited) return limited;

  // Check profile has a proper username (not temp)
  const serviceClient = createServiceClient();
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("profile/complete-onboarding profile:", profileError);
    return apiError("Internal server error", 500, "ONBOARDING_COMPLETE_FAILED");
  }

  if (!profile || isTemporaryUsername(profile.username)) {
    return apiError("Please set your username first", 400, "USERNAME_REQUIRED");
  }

  // Check user has at least 5 interests
  const { count: interestCount, error: interestError } = await serviceClient
    .from("profile_interests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (interestError) {
    console.error("profile/complete-onboarding interests:", interestError);
    return apiError("Internal server error", 500, "ONBOARDING_COMPLETE_FAILED");
  }

  if (!interestCount || interestCount < MIN_INTERESTS_REQUIRED) {
    return apiError(
      `Please select at least ${MIN_INTERESTS_REQUIRED} interests`,
      400,
      "INTERESTS_REQUIRED"
    );
  }

  // Mark onboarding as complete
  const { data, error } = await serviceClient
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id)
    .select(ONBOARDING_PROFILE_COLUMNS)
    .single();

  if (error) {
    console.error("profile/complete-onboarding:", error);
    return apiError("Internal server error", 500, "ONBOARDING_COMPLETE_FAILED");
  }

  const response = NextResponse.json(onboardingCompleteResponseSchema.parse({
    profile: data,
    success: true,
  }));
  response.cookies.set("pp_onboarded", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
});
