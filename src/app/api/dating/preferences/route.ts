import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { MIN_AGE } from "@/lib/constants";
import { profileAge, GenderIdentity } from "@/types/database";

const VALID_GENDERS: GenderIdentity[] = ["man", "woman", "non_binary", "other"];
const VALID_GOALS = ["casual", "long_term", "friends", "undecided"] as const;

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase
    .from("dating_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return apiError("Failed to fetch preferences", 500, "PREFS_FETCH_FAILED");
  }

  return NextResponse.json({ preferences: data });
});

export const PUT = withAuth(async (request, { user, supabase }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid preferences", 400, "INVALID_PREFS");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Invalid preferences", 400, "INVALID_PREFS");
  }

  // Safe: typeof/Array.isArray guards above narrow body to a non-array object
  const b = body as Record<string, unknown>;

  if (
    !Array.isArray(b.interested_in) ||
    b.interested_in.length === 0 ||
    !b.interested_in.every((g: unknown) => (VALID_GENDERS as readonly unknown[]).includes(g))
  ) {
    return apiError("Invalid preferences", 400, "INVALID_PREFS");
  }

  const minAge = b.min_age;
  const maxAge = b.max_age;
  const maxDist = b.max_distance_km;

  if (
    typeof minAge !== "number" || minAge < MIN_AGE ||
    typeof maxAge !== "number" || maxAge > 99 ||
    typeof maxDist !== "number" || maxDist < 1 || maxDist > 200 ||
    minAge > maxAge
  ) {
    return apiError("Invalid preferences", 400, "INVALID_PREFS");
  }

  // Boolean fields
  const boolFields = ["dealbreaker_smoking", "dealbreaker_drinking", "dealbreaker_kids", "verified_only", "women_only"] as const;
  for (const field of boolFields) {
    if (b[field] !== undefined && b[field] !== null && typeof b[field] !== "boolean") {
      return apiError("Invalid preferences", 400, "INVALID_PREFS");
    }
  }

  // Relationship goal
  if (b.dealbreaker_relationship_goal !== undefined && b.dealbreaker_relationship_goal !== null) {
    // Safe: widened to satisfy TS overload — null/undefined guarded above, runtime check below confirms membership
    if (!VALID_GOALS.includes(b.dealbreaker_relationship_goal as typeof VALID_GOALS[number])) {
      return apiError("Invalid preferences", 400, "INVALID_PREFS");
    }
  }

  // Age gate: check user's own DOB
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("date_of_birth")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return apiError("Failed to verify age", 500, "PROFILE_FETCH_FAILED");
  }

  if (profileData?.date_of_birth) {
    // Cast is safe: profileAge only reads date_of_birth from the passed object
    const age = profileAge(profileData as Parameters<typeof profileAge>[0]);
    if (age !== null && age < MIN_AGE) {
      return apiError("Must be 18 or older", 403, "UNDERAGE");
    }
  }

  const { data, error } = await supabase
    .from("dating_preferences")
    .upsert(
      {
        user_id: user.id,
        interested_in: b.interested_in,
        min_age: minAge,
        max_age: maxAge,
        max_distance_km: maxDist,
        dealbreaker_smoking: b.dealbreaker_smoking ?? false,
        dealbreaker_drinking: b.dealbreaker_drinking ?? false,
        dealbreaker_kids: b.dealbreaker_kids ?? false,
        dealbreaker_relationship_goal: b.dealbreaker_relationship_goal ?? null,
        verified_only: b.verified_only ?? false,
        women_only: b.women_only ?? false,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) {
    return apiError("Failed to save preferences", 500, "PREFS_SAVE_FAILED");
  }

  return NextResponse.json({ preferences: data });
});
