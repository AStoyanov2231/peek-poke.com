import { NextResponse } from "next/server";
import {
  authProfileEnsureRequestSchema,
  authProfileEnsureResponseSchema,
} from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";
import { ensureAuthProfile } from "@/lib/auth-profile";
import { withRequestContext } from "@/lib/request-context";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/validators";

export const POST = withRequestContext(async (request: Request) => {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return apiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return apiError("Content-Type must be application/json", 415, "INVALID_REQUEST");
  }
  const [, bodyError] = await parseBody(request, authProfileEnsureRequestSchema);
  if (bodyError) return bodyError;

  const result = await ensureAuthProfile(user);
  if (result.status === "disabled") {
    return apiError("Unauthorized", 401, "UNAUTHORIZED");
  }
  if (result.status === "failed") {
    console.error("auth/profile: failed to ensure authenticated profile:", result.cause);
    return apiError("Internal server error", 500, "PROFILE_BOOTSTRAP_FAILED");
  }

  return NextResponse.json(authProfileEnsureResponseSchema.parse({
    created: result.created,
    profile: result.profile,
  }));
});
