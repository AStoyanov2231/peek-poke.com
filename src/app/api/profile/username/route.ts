import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { usernameSchema, parseBody } from "@/lib/validators";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { currentProfileResponseSchema } from "@peekpoke/shared";

const PROFILE_COLUMNS = "id, username, display_name, bio, avatar_url, cover_image_url, is_online, last_seen_at, created_at, onboarding_completed";

export const PATCH = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("profileMutation", user.id);
  if (limited) return limited;

  const [data, err] = await parseBody(request, usernameSchema);
  if (err) return err;

  const trimmedUsername = data.username.trim().toLowerCase();

  // Update username - database constraint will handle uniqueness
  const serviceClient = createServiceClient();
  const [{ data: profile, error }, { data: roles, error: rolesError }] = await Promise.all([
    serviceClient
    .from("profiles")
    .update({ username: trimmedUsername })
    .eq("id", user.id)
    .select(PROFILE_COLUMNS)
    .single(),
    serviceClient.rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return apiError("Username is already taken", 409, "USERNAME_TAKEN");
    }
    console.error("profile/username:", error);
    return apiError("Internal server error", 500, "USERNAME_UPDATE_FAILED");
  }

  if (rolesError) {
    console.error("profile/username roles:", rolesError);
    return apiError("Internal server error", 500, "USERNAME_UPDATE_FAILED");
  }

  return NextResponse.json(currentProfileResponseSchema.parse({
    profile: { ...profile, roles: roles || ["user"] },
  }));
});
