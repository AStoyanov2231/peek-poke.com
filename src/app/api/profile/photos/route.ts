import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { MAX_PHOTOS } from "@/lib/constants";
import { validateImageFile, sanitizeExtension, uploadFile, uploadThumbnail } from "@/lib/upload";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data: photos, error } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("profile/photos:", error);
    return apiError("Internal server error", 500, "PHOTOS_FETCH_FAILED");
  }

  return NextResponse.json({ photos });
});

export const POST = withAuth(async (request, { user, supabase }) => {
  // Check photo count
  const { count } = await supabase
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count !== null && count >= MAX_PHOTOS) {
    return apiError(`Maximum of ${MAX_PHOTOS} photos allowed`, 400, "PHOTO_LIMIT_REACHED");
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");
  const isPrivate = formData.get("is_private") === "true";

  if (!(file instanceof File)) {
    return apiError("No file provided", 400, "UPLOAD_FAILED");
  }

  const fileError = validateImageFile(file);
  if (fileError) {
    return apiError(fileError, 400, "UPLOAD_FAILED");
  }

  // Generate file paths
  const timestamp = Date.now();
  const ext = sanitizeExtension(file.name);
  const filePath = `${user.id}/${timestamp}.${ext}`;
  const validThumb = thumbnail instanceof File ? thumbnail : null;
  const thumbPath = validThumb ? `${user.id}/${timestamp}_thumb.${ext}` : null;

  // Upload main file
  const result = await uploadFile(supabase, "profile-photos", filePath, file);
  if ("error" in result) {
    console.error("profile/photos:", result.error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  // Upload thumbnail if provided
  let thumbnailUrl: string | null = null;
  if (validThumb && thumbPath) {
    thumbnailUrl = await uploadThumbnail(supabase, "profile-photos", thumbPath, validThumb, "profile/photos");
  }

  // Get current max display_order
  const { data: maxOrderData } = await supabase
    .from("profile_photos")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrderData?.display_order ?? -1) + 1;

  // Insert photo record
  const { data: photo, error: insertError } = await supabase
    .from("profile_photos")
    .insert({
      user_id: user.id,
      storage_path: filePath,
      url: result.url,
      thumbnail_url: thumbnailUrl,
      display_order: nextOrder,
      is_private: isPrivate,
    })
    .select()
    .single();

  if (insertError) {
    // Clean up uploaded files
    await supabase.storage.from("profile-photos").remove([filePath]);
    if (thumbPath) {
      await supabase.storage.from("profile-photos").remove([thumbPath]);
    }
    if (insertError.code === 'P0001' || insertError.message?.includes('PHOTO_LIMIT_REACHED')) {
      return apiError(`Maximum of ${MAX_PHOTOS} photos allowed`, 400, "PHOTO_LIMIT_REACHED");
    }
    console.error("profile/photos:", insertError);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  return NextResponse.json({ photo }, { status: 201 });
});
