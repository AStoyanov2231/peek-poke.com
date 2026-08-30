import { NextResponse } from "next/server";
import { withAuth, requireModeratorRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { signPrivateProfilePhotos } from "@/lib/storage-urls";
import { parsePagination } from "@/lib/pagination";
import { cursorPage, mapModerationPhoto, PROFILE_PHOTO_COLUMNS } from "@/lib/api-contract";
import { decodeCursor } from "@peekpoke/shared";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";

export const GET = withNoStore(withAuth(async (request, { user, supabase }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const status = request.nextUrl.searchParams.get("status") || "pending";
  const pagination = parsePagination(request);
  if (pagination.error) return pagination.error;
  const { page, limit } = pagination.data;

  if (!["pending", "approved", "rejected"].includes(status)) {
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

  const serviceClient = createServiceClient();
  let query = serviceClient
    .from("profile_photos")
    .select(
      `${PROFILE_PHOTO_COLUMNS}, user:profiles!user_id(id, username, display_name, avatar_url, location_text, is_online, last_seen_at), reviewer:profiles!reviewed_by(id, username, display_name, avatar_url, location_text, is_online, last_seen_at)` as any,
      { count: "exact" }
    )
    .eq("approval_status", status)
    .is("moderation_action", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (decodedCursor && cursorDate) {
    const timestamp = cursorDate.toISOString();
    query = query.or(`created_at.gt.${timestamp},and(created_at.eq.${timestamp},id.gt.${decodedCursor.id})`);
  }
  const { data: rawPhotos, error, count } = decodedCursor
    ? await query.limit(limit + 1)
    : await query.range(from, from + limit);

  if (error) {
    console.error("moderation/photos:", error);
    return apiError("Internal server error", 500, "MODERATION_FETCH_FAILED");
  }

  const photos = (rawPhotos ?? []) as unknown as Array<Record<string, unknown>>;
  const mappedPhotos = await signPrivateProfilePhotos(serviceClient, photos ?? []);
  const resultPhotos = mappedPhotos.map(mapModerationPhoto);
  const cursorPageResult = cursorPage(request, resultPhotos, (item) => item.id, (item) => item.created_at);
  if (cursorPageResult.error) return cursorPageResult.error;
  const total = count ?? resultPhotos.length;
  return NextResponse.json({
    photos: cursorPageResult.data.items,
    pagination: cursorPageResult.data.page,
    legacy_pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));
