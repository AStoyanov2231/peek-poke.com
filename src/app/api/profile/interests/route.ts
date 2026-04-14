import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { interestSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data: interests, error } = await supabase
    .from("profile_interests")
    .select("*, tag:interest_tags(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("profile/interests:", error);
    return apiError("Internal server error", 500, "INTERESTS_FETCH_FAILED");
  }

  return NextResponse.json({ interests: interests || [] });
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const [data, err] = await parseBody(request, interestSchema);
  if (err) return err;

  // Insert will fail if max 5 interests (via trigger)
  const { data: interest, error } = await supabase
    .from("profile_interests")
    .insert({
      user_id: user.id,
      tag_id: data.tag_id,
    })
    .select("*, tag:interest_tags(*)")
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

  return NextResponse.json({ interest }, { status: 201 });
});
