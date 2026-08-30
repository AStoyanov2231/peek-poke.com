import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { photoUpdateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import {
  APPROVED_PROFILE_PHOTOS_BUCKET,
  PRIVATE_PROFILE_PHOTOS_BUCKET,
  signPrivateProfilePhotos,
  storageObjectFromUrl,
} from "@/lib/storage-urls";
import { enforceRateLimit } from "@/lib/rate-limit";
import { idempotencyKey, mapOwnerProfilePhoto, PROFILE_PHOTO_COLUMNS } from "@/lib/api-contract";
import { withNoStore } from "@/lib/no-store-response";
import {
  ownerProfilePhotoDeleteResponseSchema,
  ownerProfilePhotoMutationResponseSchemaFor,
} from "@peekpoke/shared";

function photoMutationResponse(
  photo: unknown,
  ownerId: string,
  idempotency: string | null | undefined,
) {
  const response = ownerProfilePhotoMutationResponseSchemaFor(
    ownerId,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  ).safeParse({
    photo: mapOwnerProfilePhoto(photo),
  });
  if (!response.success) {
    console.error("profile/photos/[photoId] response contract:", response.error.issues);
    return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
  }
  return NextResponse.json(response.data, {
    headers: idempotency ? { "idempotency-key": idempotency } : undefined,
  });
}

export const PATCH = withNoStore(withAuth<{ photoId: string }>(async (request, { user, params }) => {
  const { photoId } = params;
  const serviceClient = createServiceClient();

  if (!isValidUUID(photoId)) {
    return apiError("Invalid photo ID", 400, "PHOTO_NOT_FOUND");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;

  const limited = await enforceRateLimit("upload", user.id);
  if (limited) return limited;

  const [body, err] = await parseBody(request, photoUpdateSchema);
  if (err) return err;

  const { display_order, is_avatar, is_private } = body;

  // Verify ownership
  const { data: rawExisting } = await serviceClient
    .from("profile_photos")
    .select(PROFILE_PHOTO_COLUMNS as any)
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  const existing = rawExisting as unknown as {
    id: string;
    approval_status: "pending" | "approved" | "rejected";
    is_private: boolean;
    is_avatar: boolean;
    is_cover: boolean;
    storage_bucket: string;
    storage_path: string;
    thumbnail_storage_path: string | null;
    thumbnail_url: string | null;
    url: string;
  } | null;
  if (!existing) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  const updates: Partial<{
    display_order: number;
    is_avatar: boolean;
    is_cover: boolean;
    is_private: boolean;
    storage_bucket: string;
    thumbnail_storage_path: string | null;
    url: string;
    thumbnail_url: string | null;
  }> = {};

  if (typeof display_order === "number") {
    updates.display_order = display_order;
  }

  if (typeof is_private === "boolean") {
    updates.is_private = is_private;
    if (is_private) {
      if (existing.is_avatar) updates.is_avatar = false;
      if (existing.is_cover) updates.is_cover = false;
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
    const { data: avatarData, error: avatarError } = await serviceClient.rpc("set_avatar", {
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
    return photoMutationResponse(avatarData, user.id, idempotency.key);
  }

  if (Object.keys(updates).length === 0) {
    const [photo] = await signPrivateProfilePhotos(serviceClient, [existing]);
    return photoMutationResponse(photo, user.id, idempotency.key);
  }

  const sourceBucket = existing.storage_bucket || "profile-photos";
  const targetBucket = existing.approval_status !== "approved"
    ? sourceBucket
    : is_private === true
      ? PRIVATE_PROFILE_PHOTOS_BUCKET
      : is_private === false
        ? APPROVED_PROFILE_PHOTOS_BUCKET
        : sourceBucket;
  const movedPaths: string[] = [];
  const sourceThumbnail = existing.thumbnail_storage_path
    ? { bucket: sourceBucket, path: existing.thumbnail_storage_path }
    : storageObjectFromUrl(existing.thumbnail_url);

  async function rollbackMovedObjects() {
    let rollbackFailed = false;
    // Roll back in reverse order so the storage operation sequence remains deterministic.
    for (const path of [...movedPaths].reverse()) {
      // These moves intentionally run sequentially to preserve rollback order.
      // react-doctor-disable-next-line async-await-in-loop
      const { error: rollbackError } = await serviceClient.storage
        .from(targetBucket)
        .move(path, path, { destinationBucket: sourceBucket });
      if (rollbackError) {
        rollbackFailed = true;
        console.error("profile/photos/[photoId]: object move rollback failed:", rollbackError);
      }
    }
    return !rollbackFailed;
  }

  if (targetBucket !== sourceBucket) {
    const pathsToMove = [existing.storage_path];
    if (sourceThumbnail && sourceThumbnail.bucket === sourceBucket) {
      pathsToMove.push(sourceThumbnail.path);
    }

    const moveResults = await Promise.all(pathsToMove.map(async (path) => ({
      path,
      result: await serviceClient.storage
        .from(sourceBucket)
        .move(path, path, { destinationBucket: targetBucket }),
    })));
    const failedMove = moveResults.find(({ result }) => result.error);
    for (const { path, result } of moveResults) {
      if (!result.error) movedPaths.push(path);
    }
    if (failedMove) {
      await rollbackMovedObjects();
      console.error("profile/photos/[photoId]: cross-bucket object move failed:", failedMove.result.error);
      return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
    }

    updates.storage_bucket = targetBucket;
    updates.thumbnail_storage_path = sourceThumbnail?.path ?? null;
    updates.url = serviceClient.storage
      .from(targetBucket)
      .getPublicUrl(existing.storage_path).data.publicUrl;
    updates.thumbnail_url = targetBucket === PRIVATE_PROFILE_PHOTOS_BUCKET || !sourceThumbnail
      ? null
      : serviceClient.storage.from(targetBucket).getPublicUrl(sourceThumbnail.path).data.publicUrl;
  }

  const { data: photo, error } = await serviceClient
    .from("profile_photos")
    .update(updates)
    .eq("id", photoId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (movedPaths.length) await rollbackMovedObjects();
    console.error("profile/photos/[photoId]:", error);
    return apiError("Internal server error", 500, "PHOTO_UPDATE_FAILED");
  }

  const [responsePhoto] = await signPrivateProfilePhotos(serviceClient, [photo]);
  return photoMutationResponse(responsePhoto, user.id, idempotency.key);
}));

export const DELETE = withNoStore(withAuth<{ photoId: string }>(async (_request, { user, params }) => {
  const { photoId } = params;
  const serviceClient = createServiceClient();

  if (!isValidUUID(photoId)) {
    return apiError("Invalid photo ID", 400, "PHOTO_NOT_FOUND");
  }
  const idempotency = idempotencyKey(_request);
  if (idempotency.error) return idempotency.error;

  const limited = await enforceRateLimit("upload", user.id);
  if (limited) return limited;

  // Get photo to check existence and ownership before calling RPC
  const { data: photo } = await serviceClient
    .from("profile_photos")
    .select("storage_path, storage_bucket, thumbnail_storage_path, thumbnail_url")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (!photo) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  // Atomic: delete record + clear profiles.avatar_url if it was the avatar
  const { data: rpcData, error: rpcError } = await serviceClient.rpc("delete_photo", {
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
  const thumbnailStoragePath: string | null = rpcData?.thumbnail_storage_path ?? photo.thumbnail_storage_path;
  const storageBucket: string = rpcData?.storage_bucket ?? photo.storage_bucket ?? "profile-photos";

  const { error: storageError } = await serviceClient.storage
    .from(storageBucket)
    .remove([storagePath]);
  if (storageError) {
    console.error("profile/photos/[photoId]: storage removal failed (non-fatal):", storageError);
  }

  // Delete thumbnail if exists (best-effort)
  if (thumbnailUrl) {
    const thumbnailObject = thumbnailStoragePath
      ? { bucket: storageBucket, path: thumbnailStoragePath }
      : storageObjectFromUrl(thumbnailUrl);
    if (thumbnailObject?.bucket === storageBucket) {
      const { error: thumbError } = await serviceClient.storage
        .from(storageBucket)
        .remove([thumbnailObject.path]);
      if (thumbError) {
        console.error("profile/photos/[photoId]: thumbnail removal failed (non-fatal):", thumbError);
      }
    }
  }

  return NextResponse.json(ownerProfilePhotoDeleteResponseSchema.parse({ success: true }), {
    headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
  });
}));
