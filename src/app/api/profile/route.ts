import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { profilePatchSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  currentProfileResponseSchema,
  ownerProfileUpdateResponseSchema,
  roomCurrentProfileResponseSchema,
} from "@peekpoke/shared";
import { notifyProfileChanged } from "@/lib/realtime-broadcast";

const PROFILE_COLUMNS = "id, username, display_name, bio, avatar_url, cover_image_url, is_online, last_seen_at, created_at, onboarding_completed";
const ROOM_PROFILE_COLUMNS = "id, username, display_name, bio, avatar_url, cover_image_url, created_at, onboarding_completed";

export const GET = withAuth(async (request, { user, supabase }) => {
  const roomSurface = request.nextUrl.searchParams.get("surface") === "rooms";
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select(roomSurface ? ROOM_PROFILE_COLUMNS : PROFILE_COLUMNS).eq("id", user.id).single(),
    createServiceClient().rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  const profile = profileResult.data
    ? { ...profileResult.data, roles: rolesResult.data || ["user"] }
    : null;

  return NextResponse.json((roomSurface ? roomCurrentProfileResponseSchema : currentProfileResponseSchema).parse({ profile }));
});

export const PATCH = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("profileMutation", user.id);
  if (limited) return limited;

  const [updates, err] = await parseBody(request, profilePatchSchema);
  if (err) return err;

  const [updateResult, rolesResult] = await Promise.all([
    createServiceClient().from("profiles").update(updates).eq("id", user.id).select(PROFILE_COLUMNS).single(),
    createServiceClient().rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  if (updateResult.error) {
    console.error("profile:", updateResult.error);
    return apiError("Internal server error", 500, "PROFILE_UPDATE_FAILED");
  }

  const profile = { ...updateResult.data, roles: rolesResult.data || ["user"] };
  const response = ownerProfileUpdateResponseSchema.parse({ profile });
  await notifyProfileChanged(user.id);
  return NextResponse.json(response);
});
