import { NextResponse } from "next/server";
import { requireModeratorRole, withAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePagination } from "@/lib/pagination";
import { cursorPage, mapModerationReport } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { decodeCursor, moderationReportsResponseSchema } from "@peekpoke/shared";
import { isValidUUID } from "@/lib/validation";

const REPORT_STATUSES = new Set(["pending", "reviewing", "resolved", "dismissed"]);

export const GET = withAuth(async (request, { user, supabase }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const pagination = parsePagination(request);
  if (pagination.error) return pagination.error;
  const { page, limit } = pagination.data;
  if (!REPORT_STATUSES.has(status)) {
    return apiError("Invalid status", 400, "INVALID_STATUS");
  }

  const from = (page - 1) * limit;
  const decodedCursor = request.nextUrl.searchParams.get("cursor")
    ? decodeCursor(request.nextUrl.searchParams.get("cursor")!)
    : null;
  const cursorDate = decodedCursor ? new Date(decodedCursor.sort_value) : null;
  if (decodedCursor && (
    !isValidUUID(decodedCursor.id) ||
    !cursorDate ||
    Number.isNaN(cursorDate.getTime())
  )) {
    return apiError("Invalid cursor", 400, "INVALID_CURSOR");
  }

  let query = createServiceClient()
    .from("user_reports")
    .select(`
      id, category, details, status, created_at, reviewed_at, reviewed_by,
      reporter:profiles!reporter_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at),
      reported_user:profiles!reported_user_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at),
      reviewer:profiles!reviewed_by(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)
    `, { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (decodedCursor && cursorDate) {
    const timestamp = cursorDate.toISOString();
    query = query.or(`created_at.gt.${timestamp},and(created_at.eq.${timestamp},id.gt.${decodedCursor.id})`);
  }
  const { data, error, count } = decodedCursor
    ? await query.limit(limit + 1)
    : await query.range(from, from + limit);
  if (error) {
    console.error("moderation/reports:", error);
    return apiError("Internal server error", 500, "MODERATION_FETCH_FAILED");
  }

  let reports;
  try {
    reports = (data ?? []).map(mapModerationReport);
  } catch {
    console.error("moderation/reports: invalid database row");
    return apiError("Internal server error", 500, "MODERATION_FETCH_FAILED");
  }
  const cursorPageResult = cursorPage(request, reports, (item) => item.id, (item) => item.created_at);
  if (cursorPageResult.error) return cursorPageResult.error;
  const total = count ?? reports.length;
  const response = moderationReportsResponseSchema.safeParse({
    reports: cursorPageResult.data.items,
    pagination: cursorPageResult.data.page,
    legacy_pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
  if (!response.success) {
    console.error("moderation/reports: invalid response contract");
    return apiError("Internal server error", 500, "MODERATION_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});
