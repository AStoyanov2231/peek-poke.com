import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { photoUpdateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const PATCH = withAuth<{ photoId: string }>(async (request, { user, supabase, params }) => {
  const { photoId } = params;

  if (!isValidUUID(photoId)) {
    return apiError("Invalid photo ID", 400, "PHOTO_NOT_FOUND");
  }

  const [body, err] = await parseBody(request, photoUpdateSchema);
  if (err) return err;

  const { display_order, is_avatar, is_private } = body;

  // Verify ownership
  const { data: existing } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  const updates: Partial<{ display_order: number; is_avatar: boolean; is_private: boolean }> = {};

  if (typeof display_order === "number") {
    updates.display_order = display_order;
  }

  if (typeof is_private === "boolean") {
    updates.is_private = is_private;
    // If making a photo private that is currently the avatar, clear the avatar
    if (is_private && existing.is_avatar) {
      updates.is_avatar = false;
      const { error: clearProfileAvatarError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);
      if (clearProfileAvatarError) {
        console.error("profile/photos/[photoId]:", clearProfileAvatarError);
        return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
      }
    }
  }

  if (is_avatar === true) {
    if (existing.approval_status !== "approved") {
      return apiError("Photo must be approved before it can be set as avatar.", 400, "PHOTO_UPDATE_FAILED");
    }
    // Prevent private photos from being set as avatar (avatar is public)
    if (existing.is_private) {
      return apiError("Cannot set a private photo as avatar. Make the photo public first.", 400, "PHOTO_UPDATE_FAILED");
    }

    // TODO: Wrap in set_avatar() RPC for full atomicity across these 3 operations
    // Clear other avatars first
    const { error: clearAvatarError } = await supabase
      .from("profile_photos")
      .update({ is_avatar: false })
      .eq("user_id", user.id);

    if (clearAvatarError) {
      console.error("profile/photos/[photoId]:", clearAvatarError);
      return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
    }

    updates.is_avatar = true;

    // Also update profile avatar_url
    const { error: avatarUrlError } = await supabase
      .from("profiles")
      .update({ avatar_url: existing.url })
      .eq("id", user.id);

    if (avatarUrlError) {
      console.error("profile/photos/[photoId]:", avatarUrlError);
      return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ photo: existing });
  }

  const { data: photo, error } = await supabase
    .from("profile_photos")
    .update(updates)
    .eq("id", photoId)
    .select()
    .single();

  if (error) {
    console.error("profile/photos/[photoId]:", error);
    return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
  }

  return NextResponse.json({ photo });
});

export const DELETE = withAuth<{ photoId: string }>(async (_request, { user, supabase, params }) => {
  const { photoId } = params;

  if (!isValidUUID(photoId)) {
    return apiError("Invalid photo ID", 400, "PHOTO_NOT_FOUND");
  }

  // Get photo to delete
  const { data: photo } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (!photo) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  // Delete database record first — if this fails, storage is untouched
  const { error } = await supabase
    .from("profile_photos")
    .delete()
    .eq("id", photoId);

  if (error) {
    console.error("profile/photos/[photoId]:", error);
    return apiError("Internal server error", 500, "PHOTO_DELETE_FAILED");
  }

  // If this was the avatar, clear profile avatar_url
  if (photo.is_avatar) {
    await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
  }

  // Clean up storage best-effort after successful DB delete
  const { error: storageError } = await supabase.storage
    .from("profile-photos")
    .remove([photo.storage_path]);
  if (storageError) {
    console.error("profile/photos/[photoId]: storage removal failed (non-fatal):", storageError);
  }

  // Delete thumbnail if exists (best-effort)
  if (photo.thumbnail_url) {
    const thumbPath = photo.storage_path.replace(/\.(\w+)$/, "_thumb.$1");
    const { error: thumbError } = await supabase.storage
      .from("profile-photos")
      .remove([thumbPath]);
    if (thumbError) {
      console.error("profile/photos/[photoId]: thumbnail removal failed (non-fatal):", thumbError);
    }
  }

  return NextResponse.json({ success: true });
});
