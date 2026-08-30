import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { accountDeleteSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (request: NextRequest, { user, supabase }) => {
  const serviceClient = createServiceClient();

  const limited = await enforceRateLimit("accountDelete", user.id);
  if (limited) return limited;

  // A strict JSON body makes this destructive cookie-authenticated endpoint
  // unavailable to cross-site HTML forms and prevents accidental empty POSTs.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return apiError("Content-Type must be application/json", 415, "INVALID_REQUEST");
  }
  const [, bodyError] = await parseBody(request, accountDeleteSchema);
  if (bodyError) return bodyError;

  const authorization = request.headers.get("authorization");
  let accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!accessToken) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  }

  if (!accessToken) {
    return apiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error("account/delete: failed to load profile:", profileError);
    return apiError("Internal server error", 500, "ACCOUNT_DELETE_FAILED");
  }

  const { data: queued, error: queueError } = await serviceClient.rpc(
    "queue_account_deletion",
    {
      p_user_id: user.id,
      p_stripe_customer_id: profile.stripe_customer_id,
    },
  );

  if (queueError) {
    console.error("account/delete durable queue:", queueError);
    if (queueError.code === "PGRST202") {
      return apiError(
        "Account deletion is temporarily unavailable. Please try again.",
        503,
        "ACCOUNT_DELETE_UNAVAILABLE",
      );
    }
    return apiError("Internal server error", 500, "ACCOUNT_DELETE_FAILED");
  }
  if (!queued?.success) {
    console.error("account/delete durable queue:", queued);
    return apiError("Internal server error", 500, "ACCOUNT_DELETE_FAILED");
  }

  // Queueing atomically marks the profile deleted, so app APIs reject existing
  // JWTs before session revocation. Keep migration/provider failures retryable
  // by revoking refresh sessions only after that durable commit succeeds.
  const { error: signOutError } = await serviceClient.auth.admin.signOut(
    accessToken,
    "global",
  );
  if (signOutError) {
    console.error("account/delete: failed to revoke sessions after queueing:", signOutError);
  }

  // Clear the current web cookie/session state. Native clients clear their
  // SecureStore session after the successful response.
  const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });
  if (localSignOutError) {
    console.error("account/delete local session cleanup:", localSignOutError);
  }

  return NextResponse.json({ success: true, queued: true }, { status: 202 });
});
