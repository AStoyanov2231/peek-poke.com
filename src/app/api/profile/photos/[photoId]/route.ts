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

    // Atomic: clear all other avatars + mark this photo + sync profiles.avatar_url
    const { data: avatarData, error: avatarError } = await supabase.rpc("set_avatar", {
      p_user_id: user.id,
      p_photo_id: photoId,
    });

    if (avatarError) {
      console.error("profile/photos/[photoId]:", avatarError);
      return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
    }

    if (avatarData?.error) {
      return apiError(avatarData.error, avatarData.status || 400, "PHOTO_UPDATE_FAILED");
    }

    // set_avatar already applied all updates — return the photo from the RPC
    return NextResponse.json({ photo: avatarData });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ photo: existing });
  }

  const { data: photo, error } = await supabase
    .from("profile_photos")
    .update(updates)
    .eq("id", photoId)
    .eq("user_id", user.id)
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

  // Get photo to check existence and ownership before calling RPC
  const { data: photo } = await supabase
    .from("profile_photos")
    .select("storage_path, thumbnail_url")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (!photo) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  // Atomic: delete record + clear profiles.avatar_url if it was the avatar
  const { data: rpcData, error: rpcError } = await supabase.rpc("delete_photo", {
    p_user_id: user.id,
    p_photo_id: photoId,
  });

  if (rpcError) {
    console.error("profile/photos/[photoId]:", rpcError);
    return apiError("Internal server error", 500, "PHOTO_DELETE_FAILED");
  }

  if (rpcData?.error) {
    return apiError(rpcData.error, rpcData.status || 400, "PHOTO_DELETE_FAILED");
  }

  // Clean up storage best-effort after successful DB delete
  const storagePath: string = rpcData?.storage_path ?? photo.storage_path;
  const thumbnailUrl: string | null = rpcData?.thumbnail_url ?? photo.thumbnail_url;

  const { error: storageError } = await supabase.storage
    .from("profile-photos")
    .remove([storagePath]);
  if (storageError) {
    console.error("profile/photos/[photoId]: storage removal failed (non-fatal):", storageError);
  }

  // Delete thumbnail if exists (best-effort)
  if (thumbnailUrl) {
    const thumbPath = storagePath.replace(/\.(\w+)$/, "_thumb.$1");
    const { error: thumbError } = await supabase.storage
      .from("profile-photos")
      .remove([thumbPath]);
    if (thumbError) {
      console.error("profile/photos/[photoId]: thumbnail removal failed (non-fatal):", thumbError);
    }
  }

  return NextResponse.json({ success: true });
});
