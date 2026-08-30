import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withAuth } from "@/lib/auth";
import { MAX_PHOTOS } from "@/lib/constants";
import { imageExtension, normalizeImageFile, parseBoundedFormData, validateImageFile, validateUploadBodySize, uploadFile } from "@/lib/upload";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { idempotencyKey, mapOwnerProfilePhoto } from "@/lib/api-contract";
import { withNoStore } from "@/lib/no-store-response";
import { ownerProfilePhotoMutationResponseSchemaFor } from "@peekpoke/shared";
import { PROFILE_MEDIA_QUARANTINE_BUCKET, signPrivateProfilePhotos } from "@/lib/storage-urls";

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  const limited = await enforceRateLimit("upload", user.id);
  if (limited) return limited;
  const bodySizeError = validateUploadBodySize(request);
  if (bodySizeError) return apiError(bodySizeError, 413, "UPLOAD_FAILED");

  const serviceClient = createServiceClient();
  const { count } = await serviceClient
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count !== null && count >= MAX_PHOTOS) {
    return apiError(`Maximum of ${MAX_PHOTOS} photos allowed`, 400, "PHOTO_LIMIT_REACHED");
  }

  const formData = await parseBoundedFormData(request);
  if (!formData) return apiError("Upload body too large or invalid", 413, "UPLOAD_FAILED");
  const file = formData.get("file");
  if (!(file instanceof File)) return apiError("No file provided", 400, "UPLOAD_FAILED");
  const fileError = await validateImageFile(file);
  if (fileError) return apiError(fileError, 400, "UPLOAD_FAILED");
  const normalized = await normalizeImageFile(file);
  if ("error" in normalized) return apiError(normalized.error, 400, "UPLOAD_FAILED");
  const normalizedFile = normalized.file;

  const photoId = randomUUID();
  const filePath = `${user.id}/${photoId}_cover.${imageExtension(normalizedFile)}`;
  const result = await uploadFile(
    serviceClient,
    PROFILE_MEDIA_QUARANTINE_BUCKET,
    filePath,
    normalizedFile,
    { public: false },
  );
  if ("error" in result) {
    console.error("profile/cover:", result.error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  const { data: maxOrderData } = await serviceClient
    .from("profile_photos")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .single();
  const { data: photo, error } = await serviceClient
    .from("profile_photos")
    .insert({
      id: photoId,
      user_id: user.id,
      storage_path: filePath,
      storage_bucket: PROFILE_MEDIA_QUARANTINE_BUCKET,
      thumbnail_storage_path: null,
      url: serviceClient.storage
        .from(PROFILE_MEDIA_QUARANTINE_BUCKET)
        .getPublicUrl(filePath).data.publicUrl,
      thumbnail_url: null,
      is_avatar: false,
      is_cover: true,
      is_private: false,
      display_order: (maxOrderData?.display_order ?? -1) + 1,
      approval_status: "pending",
    })
    .select()
    .single();

  if (error || !photo) {
    await serviceClient.storage.from(PROFILE_MEDIA_QUARANTINE_BUCKET).remove([filePath]);
    console.error("profile/cover:", error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  const [signedPhoto] = await signPrivateProfilePhotos(serviceClient, [photo]);
  const response = ownerProfilePhotoMutationResponseSchemaFor(
    user.id,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({ photo: mapOwnerProfilePhoto(signedPhoto) });
  if (!response.success) {
    console.error("profile/cover response contract:", response.error.issues);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }
  return NextResponse.json(response.data, {
    status: 202,
    headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
  });
}));
