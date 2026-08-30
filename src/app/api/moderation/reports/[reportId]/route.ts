import { NextResponse } from "next/server";
import { requireModeratorRole, withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { parseBody, reportReviewSchema } from "@/lib/validators";
import { idempotencyKey, mapModerationReport } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { moderationReportMutationResponseSchemaFor } from "@peekpoke/shared";

export const PATCH = withAuth<{ reportId: string }>(async (request, { user, supabase, params }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;
  const limited = await enforceRateLimit("moderation", user.id);
  if (limited) return limited;
  if (!isValidUUID(params.reportId)) {
    return apiError("Invalid report", 400, "INVALID_REPORT_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  const [body, bodyError] = await parseBody(request, reportReviewSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient()
    .from("user_reports")
    .update({
      status: body.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.reportId)
    .select("id, category, details, status, created_at, reviewed_at, reviewed_by, reporter:profiles!reporter_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at), reported_user:profiles!reported_user_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at), reviewer:profiles!reviewed_by(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)")
    .single();
  if (error) {
    console.error("moderation/reports/[reportId]:", error);
    return apiError("Internal server error", 500, "MODERATION_REVIEW_FAILED");
  }
  let report;
  try {
    report = mapModerationReport(data);
  } catch {
    console.error("moderation/reports/[reportId]: invalid database row");
    return apiError("Internal server error", 500, "MODERATION_REVIEW_FAILED");
  }
  const response = moderationReportMutationResponseSchemaFor(
    params.reportId,
    body.status,
  ).safeParse({ report });
  if (!response.success) {
    console.error("moderation/reports/[reportId]: invalid response contract");
    return apiError("Internal server error", 500, "MODERATION_REVIEW_FAILED");
  }
  return NextResponse.json(response.data, {
    headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
  });
});
