import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { profileUpdateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

const PROFILE_COLUMNS = "id, username, display_name, bio, avatar_url, location_text, is_online, last_seen_at, created_at, onboarding_completed";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single(),
    supabase.rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  const profile = profileResult.data
    ? { ...profileResult.data, roles: rolesResult.data || ["user"] }
    : null;

  return NextResponse.json({ profile });
});

export const PATCH = withAuth(async (request, { user, supabase }) => {
  const [updates, err] = await parseBody(request, profileUpdateSchema);
  if (err) return err;

  const [updateResult, rolesResult] = await Promise.all([
    supabase.from("profiles").update(updates).eq("id", user.id).select(PROFILE_COLUMNS).single(),
    supabase.rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  if (updateResult.error) {
    console.error("profile:", updateResult.error);
    return apiError("Internal server error", 500, "PROFILE_UPDATE_FAILED");
  }

  const profile = { ...updateResult.data, roles: rolesResult.data || ["user"] };
  return NextResponse.json({ profile });
});
