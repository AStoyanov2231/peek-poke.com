import { NextResponse } from "next/server";
import { hasSubscriberRole, isBlocked, withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { signPrivateProfilePhotos } from "@/lib/storage-urls";
import {
  cursorPage,
  mapPublicProfile,
  mapPublicProfilePhoto,
  mapPublicProfileRelationship,
  PROFILE_PHOTO_COLUMNS,
  utc,
} from "@/lib/api-contract";
import { withNoStore } from "@/lib/no-store-response";
import { publicProfileResponseSchemaFor } from "@peekpoke/shared";

export const GET = withNoStore(withAuth<{ userId: string }>(async (request, { user, supabase, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId)) {
    return apiError("Invalid user ID", 400, "INVALID_USER_ID");
  }

  if (user.id !== userId && await isBlocked(supabase, user.id, userId)) {
    return apiError("Profile not found", 404, "USER_NOT_FOUND");
  }

  // This RPC is service-role-only because it joins private profile/photo data.
  // The authenticated viewer identity is validated above and passed explicitly.
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc("get_user_profile", {
    p_target_id: userId,
    p_viewer_id: user.id,
  });

  if (error) {
    console.error("profile/[userId]:", error);
    return apiError("Internal server error", 500, "PROFILE_FETCH_FAILED");
  }

  const rawProfile = data?.profile && typeof data.profile === "object"
    ? data.profile as Record<string, unknown>
    : null;
  if (!rawProfile || rawProfile.deleted_at != null || rawProfile.account_deleted === true || data?.error) {
    return apiError("Profile not found", 404, "USER_NOT_FOUND");
  }

  const roomSurface = request.nextUrl.searchParams.get("surface") === "rooms";
  const { data: rawPhotoRows, error: photoError } = await serviceClient
    .from("profile_photos")
    .select(PROFILE_PHOTO_COLUMNS as any)
    .eq("user_id", userId)
    .eq("approval_status", "approved")
    .is("moderation_action", null)
    .limit(101)
    .order("display_order", { ascending: true });
  if (photoError) {
    console.error("profile/[userId] photos:", photoError);
    return apiError("Internal server error", 500, "PROFILE_FETCH_FAILED");
  }

  const photoRows = (rawPhotoRows ?? []) as unknown as Array<{
    is_private?: boolean;
    storage_bucket?: string | null;
    storage_path?: string | null;
    thumbnail_storage_path?: string | null;
    url?: string;
    thumbnail_url?: string | null;
    id: string;
    created_at: string;
  }>;
  const canViewPrivate = user.id === userId || await hasSubscriberRole(supabase, user.id);
  // Legacy approved objects live in the now-private mixed bucket until their
  // durable promotion completes, so public-intent rows also need signing.
  const viewablePhotos = await signPrivateProfilePhotos(serviceClient, photoRows ?? []);
  const photos = viewablePhotos.map((photo) => mapPublicProfilePhoto(
    photo,
    photo.is_private && !canViewPrivate ? "locked" : "viewable",
  ));
  const approvedAvatar = photos.find((photo) =>
    photo.is_avatar && !photo.is_cover && !photo.is_private && photo.access === "viewable"
  ) ?? null;
  const approvedCover = photos.find((photo) =>
    photo.is_cover && !photo.is_avatar && !photo.is_private && photo.access === "viewable"
  ) ?? null;
  const photoPage = cursorPage(
    request,
    photos,
    (item) => item.id,
    (item) => `${String(item.display_order).padStart(6, "0")}:${item.created_at}`,
  );
  if (photoPage.error) return photoPage.error;

  const rawStats = data?.stats && typeof data.stats === "object" ? data.stats as Record<string, unknown> : {};
  const interests = Array.isArray(data?.interests) ? data.interests.slice(0, 50).map((interest: unknown) => {
    const row = interest && typeof interest === "object" ? interest as Record<string, unknown> : {};
    const tag = row.tag && typeof row.tag === "object" ? row.tag as Record<string, unknown> : {};
    return {
      id: row.id,
      user_id: row.user_id,
      tag_id: row.tag_id,
      created_at: utc(row.created_at),
      tag: {
        id: tag.id,
        name: tag.name,
        category: tag.category,
        icon: tag.icon,
        display_order: tag.display_order,
      },
    };
  }) : [];
  const safeProfile = mapPublicProfile(rawProfile);
  if (roomSurface) safeProfile.location_text = null;
  safeProfile.avatar_url = approvedAvatar?.url ?? null;
  safeProfile.cover_image_url = approvedCover?.url ?? null;
  const payload = publicProfileResponseSchemaFor(
    user.id,
    userId,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({
    profile: safeProfile,
    photos: photoPage.data.items,
    featured_media: { avatar: approvedAvatar, cover: approvedCover },
    interests,
    stats: {
      photos_count: photos.length,
      friends_count: roomSurface ? 0 : rawStats.friends_count,
    },
    friendship: roomSurface
      ? null
      : data?.friendship ? mapPublicProfileRelationship(data.friendship) : null,
    pagination: photoPage.data.page,
  });
  if (!payload.success) {
    console.error("profile/[userId] response contract:", payload.error.issues);
    return apiError("Internal server error", 500, "PROFILE_FETCH_FAILED");
  }
  return NextResponse.json(payload.data);
}));
