import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withAuth } from "@/lib/auth";
import { MAX_PHOTOS } from "@/lib/constants";
import { imageExtension, normalizeImageFile, parseBoundedFormData, validateImageFile, validateThumbnail, validateUploadBodySize, uploadFile, uploadThumbnail } from "@/lib/upload";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PROFILE_MEDIA_QUARANTINE_BUCKET, signPrivateProfilePhotos } from "@/lib/storage-urls";
import { createServiceClient } from "@/lib/supabase/server";
import { cursorPage, idempotencyKey, mapOwnerProfilePhoto, PROFILE_PHOTO_COLUMNS } from "@/lib/api-contract";
import { withNoStore } from "@/lib/no-store-response";
import {
  AccountStorageWriteError,
  runAccountStorageWrite,
} from "@/lib/account-storage-write";
import {
  ownerProfilePhotoMutationResponseSchemaFor,
  ownerProfilePhotosResponseSchemaFor,
} from "@peekpoke/shared";

export const GET = withNoStore(withAuth(async (request, { user }) => {
  const serviceClient = createServiceClient();
  const { data: rawPhotos, error } = await serviceClient
    .from("profile_photos")
    .select(PROFILE_PHOTO_COLUMNS as any)
    .eq("user_id", user.id)
    .limit(101)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("profile/photos:", error);
    return apiError("Internal server error", 500, "PHOTOS_FETCH_FAILED");
  }

  const photos = (rawPhotos ?? []) as unknown as Array<{
    is_private?: boolean;
    storage_bucket?: string | null;
    storage_path?: string | null;
    thumbnail_storage_path?: string | null;
    url?: string;
    thumbnail_url?: string | null;
    id: string;
    created_at: string;
  }>;
  const signedPhotos = (await signPrivateProfilePhotos(serviceClient, photos ?? [])).map(mapOwnerProfilePhoto);
  const page = cursorPage(request, signedPhotos, (item) => item.id, (item) => item.created_at);
  if (page.error) return page.error;
  const response = ownerProfilePhotosResponseSchemaFor(
    user.id,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({
    photos: page.data.items,
    pagination: page.data.page,
  });
  if (!response.success) {
    console.error("profile/photos response contract:", response.error.issues);
    return apiError("Internal server error", 500, "PHOTOS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
}));

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  const serviceClient = createServiceClient();
  const limited = await enforceRateLimit("upload", user.id);
  if (limited) return limited;
  const bodySizeError = validateUploadBodySize(request);
  if (bodySizeError) return apiError(bodySizeError, 413, "UPLOAD_FAILED");

  // Check photo count
  const { count } = await serviceClient
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count !== null && count >= MAX_PHOTOS) {
    return apiError(`Maximum of ${MAX_PHOTOS} photos allowed`, 400, "PHOTO_LIMIT_REACHED");
  }

  // Parse form data
  const formData = await parseBoundedFormData(request);
  if (!formData) return apiError("Upload body too large or invalid", 413, "UPLOAD_FAILED");
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");
  const isPrivate = formData.get("is_private") === "true";
  const bucket = PROFILE_MEDIA_QUARANTINE_BUCKET;

  if (!(file instanceof File)) {
    return apiError("No file provided", 400, "UPLOAD_FAILED");
  }

  const fileError = await validateImageFile(file);
  if (fileError) {
    return apiError(fileError, 400, "UPLOAD_FAILED");
  }
  const normalized = await normalizeImageFile(file);
  if ("error" in normalized) return apiError(normalized.error, 400, "UPLOAD_FAILED");
  const normalizedFile = normalized.file;

  // Generate file paths
  const photoId = randomUUID();
  const ext = imageExtension(normalizedFile);
  const filePath = `${user.id}/${photoId}.${ext}`;
  const validThumb = thumbnail instanceof File ? thumbnail : null;
  if (validThumb) {
    const thumbError = await validateThumbnail(validThumb);
    if (thumbError) return apiError(thumbError, 400, "UPLOAD_FAILED");
  }
  const normalizedThumbnail = validThumb
    ? await normalizeImageFile(validThumb, { thumbnail: true })
    : null;
  if (normalizedThumbnail && "error" in normalizedThumbnail) {
    return apiError(normalizedThumbnail.error, 400, "UPLOAD_FAILED");
  }
  const thumbnailFile = normalizedThumbnail && "file" in normalizedThumbnail
    ? normalizedThumbnail.file
    : null;
  const thumbPath = thumbnailFile ? `${user.id}/${photoId}_thumb.${imageExtension(thumbnailFile)}` : null;

  let insertError: { code?: string; message?: string } | null = null;
  let photo: any;
  try {
    photo = await runAccountStorageWrite(
      serviceClient,
      user.id,
      "profile_photo_upload",
      async () => {
        const result = await uploadFile(serviceClient, bucket, filePath, normalizedFile, { public: false });
        if ("error" in result) throw new Error(result.error);

        let thumbnailUrl: string | null = null;
        if (thumbnailFile && thumbPath) {
          thumbnailUrl = await uploadThumbnail(
            serviceClient,
            bucket,
            thumbPath,
            thumbnailFile,
            "profile/photos",
            { public: false },
          );
        }

        const { data: maxOrderData } = await serviceClient
          .from("profile_photos")
          .select("display_order")
          .eq("user_id", user.id)
          .order("display_order", { ascending: false })
          .limit(1)
          .single();
        const storedUrl = serviceClient.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
        const inserted = await serviceClient
          .from("profile_photos")
          .insert({
            id: photoId,
            user_id: user.id,
            storage_path: filePath,
            storage_bucket: bucket,
            thumbnail_storage_path: thumbnailUrl ? thumbPath : null,
            url: storedUrl,
            thumbnail_url: null,
            display_order: (maxOrderData?.display_order ?? -1) + 1,
            is_private: isPrivate,
            approval_status: "pending",
          })
          .select()
          .single();
        if (inserted.error || !inserted.data) {
          insertError = inserted.error;
          throw inserted.error ?? new Error("Profile photo commit failed");
        }
        return inserted.data;
      },
      async () => {
        await serviceClient.storage.from(bucket).remove([
          filePath,
          ...(thumbPath ? [thumbPath] : []),
        ]);
      },
      photoId,
    );
  } catch (error) {
    if (error instanceof AccountStorageWriteError) {
      return apiError(error.message, error.status, error.code);
    }
    const failedInsert = insertError as { code?: string; message?: string } | null;
    if (failedInsert?.code === 'P0001' || failedInsert?.message?.includes('PHOTO_LIMIT_REACHED')) {
      return apiError(`Maximum of ${MAX_PHOTOS} photos allowed`, 400, "PHOTO_LIMIT_REACHED");
    }
    console.error("profile/photos:", error);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }

  const [responsePhoto] = await signPrivateProfilePhotos(createServiceClient(), [photo]);
  const response = ownerProfilePhotoMutationResponseSchemaFor(
    user.id,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({
    photo: mapOwnerProfilePhoto(responsePhoto),
  });
  if (!response.success) {
    console.error("profile/photos mutation response contract:", response.error.issues);
    return apiError("Internal server error", 500, "UPLOAD_FAILED");
  }
  return NextResponse.json(response.data, {
    status: 201,
    headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
  });
}));
