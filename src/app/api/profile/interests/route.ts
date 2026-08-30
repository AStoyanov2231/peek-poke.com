import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { interestSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  profileInterestCreateResponseSchema,
  profileInterestsResponseSchema,
} from "@peekpoke/shared";

const PROFILE_INTEREST_COLUMNS =
  "id, user_id, tag_id, created_at, tag:interest_tags(id, name, category, icon, display_order)";

export const GET = withAuth(async (_request, { user }) => {
  const { data: interests, error } = await createServiceClient()
    .from("profile_interests")
    .select(PROFILE_INTEREST_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("profile/interests:", error);
    return apiError("Internal server error", 500, "INTERESTS_FETCH_FAILED");
  }

  return NextResponse.json(profileInterestsResponseSchema.parse({ interests: interests ?? [] }));
});

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("profileMutation", user.id);
  if (limited) return limited;

  const [data, err] = await parseBody(request, interestSchema);
  if (err) return err;

  // Insert will fail if max 5 interests (via trigger)
  const { data: interest, error } = await createServiceClient()
    .from("profile_interests")
    .insert({
      user_id: user.id,
      tag_id: data.tag_id,
    })
    .select(PROFILE_INTEREST_COLUMNS)
    .single();

  if (error) {
    if (error.message?.includes("Maximum of 5 interests")) {
      return apiError("Maximum of 5 interests allowed", 400, "INTEREST_LIMIT_REACHED");
    }
    if (error.code === "23505") {
      return apiError("Interest already added", 400, "INTEREST_DUPLICATE");
    }
    console.error("profile/interests:", error);
    return apiError("Internal server error", 500, "INTEREST_ADD_FAILED");
  }

  return NextResponse.json(profileInterestCreateResponseSchema.parse({ interest }), { status: 201 });
});
