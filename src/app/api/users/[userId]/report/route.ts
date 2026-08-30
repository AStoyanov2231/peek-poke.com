import { NextResponse } from "next/server";
import { isDeletedProfile, withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { parseBody, userReportSchema } from "@/lib/validators";

export const POST = withAuth<{ userId: string }>(async (request, { user, params }) => {
  const { userId } = params;
  if (!isValidUUID(userId) || userId === user.id) {
    return apiError("Invalid user", 400, "INVALID_USER");
  }

  const limited = await enforceRateLimit("userReport", user.id);
  if (limited) return limited;
  const [body, bodyError] = await parseBody(request, userReportSchema);
  if (bodyError) return bodyError;
  if (await isDeletedProfile(userId)) {
    return apiError("User not found", 404, "INVALID_USER");
  }

  const { error } = await createServiceClient().from("user_reports").insert({
    reporter_id: user.id,
    reported_user_id: userId,
    category: body.category,
    details: body.details ?? null,
  });

  // Re-reporting an account that is already pending is idempotent.
  if (error?.code === "23503") {
    return apiError("User not found", 404, "INVALID_USER");
  }
  if (error && error.code !== "23505") {
    console.error("users/report:", error);
    return apiError("Internal server error", 500, "REPORT_FAILED");
  }

  return NextResponse.json({ received: true }, { status: 202 });
});
