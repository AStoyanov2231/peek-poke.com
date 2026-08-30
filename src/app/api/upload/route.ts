import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { checkDmMediaQuota, imageExtension, normalizeImageFile, parseBoundedFormData, validateImageFile, validateThumbnail, validateUploadBodySize, uploadFile, uploadThumbnail } from "@/lib/upload";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import {
  AccountStorageWriteError,
  runAccountStorageWrite,
} from "@/lib/account-storage-write";

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("upload", user.id);
  if (limited) return limited;
  const bodySizeError = validateUploadBodySize(request);
  if (bodySizeError) return apiError(bodySizeError, 413, "UPLOAD_FAILED");

  const formData = await parseBoundedFormData(request);
  if (!formData) return apiError("Upload body too large or invalid", 413, "UPLOAD_FAILED");
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");

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

  const validThumbnail = thumbnail instanceof File ? thumbnail : null;
  if (validThumbnail) {
    const thumbError = await validateThumbnail(validThumbnail);
    if (thumbError) {
      return apiError(thumbError, 400, "UPLOAD_FAILED");
    }
  }
  const normalizedThumbnail = validThumbnail
    ? await normalizeImageFile(validThumbnail, { thumbnail: true })
    : null;
  if (normalizedThumbnail && "error" in normalizedThumbnail) {
    return apiError(normalizedThumbnail.error, 400, "UPLOAD_FAILED");
  }
  const thumbnailFile = normalizedThumbnail && "file" in normalizedThumbnail
    ? normalizedThumbnail.file
    : null;

  const serviceClient = createServiceClient();
  const operationId = crypto.randomUUID();
  const objectId = `${Date.now()}-${operationId}`;
  const ext = imageExtension(normalizedFile);
  const filePath = `${user.id}/${objectId}.${ext}`;
  const thumbPath = thumbnailFile
    ? `${user.id}/${objectId}_thumb.${imageExtension(thumbnailFile)}`
    : null;

  try {
    const uploaded = await runAccountStorageWrite(
      serviceClient,
      user.id,
      "dm_upload",
      async () => {
        const quota = await checkDmMediaQuota(
          serviceClient,
          user.id,
          normalizedFile.size + (thumbnailFile?.size ?? 0),
          operationId,
        );
        if (quota === "unavailable" || quota === "busy") {
          throw new AccountStorageWriteError(
            "STORAGE_WRITE_UNAVAILABLE",
            "Upload temporarily unavailable",
            503,
          );
        }
        if (quota === "exceeded") {
          throw new Error("MEDIA_QUOTA_EXCEEDED");
        }
        const result = await uploadFile(
          serviceClient,
          "media",
          filePath,
          normalizedFile,
          { public: false },
        );
        if ("error" in result) throw new Error(result.error);

        let thumbnailUrl: string | null = null;
        if (thumbnailFile && thumbPath) {
          thumbnailUrl = await uploadThumbnail(
            serviceClient,
            "media",
            thumbPath,
            thumbnailFile,
            "upload",
            { public: false },
          );
          if (!thumbnailUrl) {
            console.warn("upload: thumbnail upload failed, continuing without thumbnail");
          }
        }
        return { url: result.url, thumbnailUrl };
      },
      async () => {
        await serviceClient.storage.from("media").remove([
          filePath,
          ...(thumbPath ? [thumbPath] : []),
        ]);
      },
      operationId,
    );
    return NextResponse.json(uploaded);
  } catch (error) {
    if (error instanceof AccountStorageWriteError) {
      return apiError(error.message, error.status, error.code);
    }
    if (error instanceof Error && error.message === "MEDIA_QUOTA_EXCEEDED") {
      return apiError(
        "Message media storage limit reached. Delete older photo messages before uploading more.",
        413,
        "MEDIA_QUOTA_EXCEEDED",
      );
    }
    console.error("upload:", error);
    return apiError("Upload failed", 500, "UPLOAD_FAILED");
  }
});
