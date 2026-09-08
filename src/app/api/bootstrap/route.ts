import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { API_VERSION, bootstrapSchema } from "@peekpoke/shared";

export const GET = withAuth(async (_request, { user, ageAdmission }) => {
  if (!ageAdmission) {
    return apiError("Bootstrap failed", 500, "BOOTSTRAP_FAILED");
  }
  const serviceClient = createServiceClient();
  const [
    { data: profile, error: profileError },
    { data: roles, error: rolesError },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, onboarding_completed")
      .eq("id", user.id)
      .single(),
    serviceClient.rpc("get_user_roles", { p_user_id: user.id }),
  ]);

  if (profileError || rolesError || !profile) {
    console.error("bootstrap:", profileError ?? rolesError);
    return apiError("Bootstrap failed", 500, "BOOTSTRAP_FAILED");
  }

  const threadResult = ageAdmission.status === "adult"
    ? await serviceClient
      .from("dm_threads")
      .select("id", { count: "exact", head: true })
      .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
    : { count: 0, error: null };
  if (threadResult.error) {
    console.error("bootstrap:", threadResult.error);
    return apiError("Bootstrap failed", 500, "BOOTSTRAP_FAILED");
  }

  const payload = {
    version: API_VERSION,
    identity: { id: user.id, email: user.email ?? null },
    onboarding_completed: profile.onboarding_completed === true,
    age_admission: ageAdmission,
    roles: Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : ["user"],
    feature_config_version: process.env.API_FEATURE_CONFIG_VERSION ?? "v1",
    unread_summary: { threads: Math.max(0, threadResult.count ?? 0) },
  };
  return NextResponse.json(bootstrapSchema.parse(payload));
}, { allowPendingAgeAdmission: true });
