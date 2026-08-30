import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { API_VERSION, bootstrapSchema, roomBootstrapSchema } from "@peekpoke/shared";

export const GET = withAuth(async (request, { user }) => {
  const roomSurface = request.nextUrl.searchParams.get("surface") === "rooms";
  const serviceClient = createServiceClient();
  const [
    { data: profile, error: profileError },
    { data: roles, error: rolesError },
    { count, error: threadError },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, onboarding_completed")
      .eq("id", user.id)
      .single(),
    serviceClient.rpc("get_user_roles", { p_user_id: user.id }),
    roomSurface
      ? Promise.resolve({ count: null, error: null })
      : serviceClient
        .from("dm_threads")
        .select("id", { count: "exact", head: true })
        .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`),
  ]);

  if (profileError || rolesError || threadError || !profile) {
    console.error("bootstrap:", profileError ?? rolesError ?? threadError);
    return apiError("Bootstrap failed", 500, "BOOTSTRAP_FAILED");
  }

  const payload = {
    version: API_VERSION,
    identity: { id: user.id, email: user.email ?? null },
    onboarding_completed: profile.onboarding_completed === true,
    roles: Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : ["user"],
    feature_config_version: process.env.API_FEATURE_CONFIG_VERSION ?? "v1",
    unread_summary: roomSurface
      ? { rooms: 0 }
      : { threads: Math.max(0, count ?? 0) },
  };
  return NextResponse.json((roomSurface ? roomBootstrapSchema : bootstrapSchema).parse(payload));
});
