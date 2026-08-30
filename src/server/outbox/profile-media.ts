import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPROVED_PROFILE_PHOTOS_BUCKET,
  LEGACY_PROFILE_PHOTOS_BUCKET,
  PRIVATE_PROFILE_PHOTOS_BUCKET,
  PROFILE_MEDIA_QUARANTINE_BUCKET,
} from "@/lib/storage-urls";

type ProfileMediaEvent = {
  aggregate_id: string;
  payload: Record<string, unknown>;
};

type StorageObject = { bucket: string; path: string };

type ParsedProfileMediaOperation = {
  photoId: string;
  operationId: string;
  action: string;
  destinationBucket: string | null;
  destinationPath: string | null;
  destinationThumbnailPath: string | null;
  sourceObjects: StorageObject[];
  destinationObjects: StorageObject[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SOURCE_BUCKETS = new Set([
  APPROVED_PROFILE_PHOTOS_BUCKET,
  LEGACY_PROFILE_PHOTOS_BUCKET,
  PRIVATE_PROFILE_PHOTOS_BUCKET,
  PROFILE_MEDIA_QUARANTINE_BUCKET,
]);

function requiredString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Profile media payload is missing ${key}`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Profile media payload has invalid ${key}`);
  }
  return value;
}

function assertOwnerPath(path: string, ownerId: string) {
  const segments = path.split("/");
  if (
    segments.length < 2
    || segments[0] !== ownerId
    || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))
  ) {
    throw new Error("Profile media object is outside its owner boundary");
  }
}

function uniqueObjects(objects: Array<StorageObject | null>) {
  return [...new Map(objects.flatMap((object) => object
    ? [[`${object.bucket}\0${object.path}`, object] as const]
    : [])).values()];
}

async function removeObjects(supabase: SupabaseClient, objects: StorageObject[]) {
  const grouped = new Map<string, string[]>();
  for (const object of objects) {
    const paths = grouped.get(object.bucket) ?? [];
    paths.push(object.path);
    grouped.set(object.bucket, paths);
  }
  for (const [bucket, paths] of grouped) {
    // Storage removal is idempotent; sequential buckets keep failure recovery deterministic.
    // react-doctor-disable-next-line async-await-in-loop
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new Error(`Profile media cleanup failed in ${bucket}`);
  }
}

async function copyObject(
  supabase: SupabaseClient,
  source: StorageObject,
  destination: StorageObject,
) {
  const { error } = await supabase.storage
    .from(source.bucket)
    .copy(source.path, destination.path, { destinationBucket: destination.bucket });
  if (error) throw new Error("Profile media promotion copy failed");
}

function parseProfileMediaOperation(event: ProfileMediaEvent): ParsedProfileMediaOperation {
  const photoId = requiredString(event.payload, "photo_id");
  const operationId = requiredString(event.payload, "operation_id");
  const ownerId = requiredString(event.payload, "owner_id");
  const action = requiredString(event.payload, "action");
  const sourceBucket = requiredString(event.payload, "source_bucket");
  const sourcePath = requiredString(event.payload, "source_path");
  const sourceThumbnailPath = optionalString(event.payload, "source_thumbnail_path");
  const destinationBucket = optionalString(event.payload, "destination_bucket");
  const destinationPath = optionalString(event.payload, "destination_path");
  const destinationThumbnailPath = optionalString(event.payload, "destination_thumbnail_path");

  if (
    event.aggregate_id !== operationId
    || !UUID.test(photoId)
    || !UUID.test(operationId)
    || !UUID.test(ownerId)
    || !["approve", "reject", "quarantine"].includes(action)
    || !ALLOWED_SOURCE_BUCKETS.has(sourceBucket)
  ) {
    throw new Error("Profile media operation fence is invalid");
  }
  assertOwnerPath(sourcePath, ownerId);
  if (sourceThumbnailPath) assertOwnerPath(sourceThumbnailPath, ownerId);

  const requiresDestination = action !== "reject";
  const allowedDestination = action === "quarantine"
    ? destinationBucket === PROFILE_MEDIA_QUARANTINE_BUCKET
    : destinationBucket === APPROVED_PROFILE_PHOTOS_BUCKET
      || destinationBucket === PRIVATE_PROFILE_PHOTOS_BUCKET;
  if (
    requiresDestination !== Boolean(destinationBucket && destinationPath)
    || (requiresDestination && !allowedDestination)
    || (requiresDestination && (!destinationThumbnailPath !== !sourceThumbnailPath))
  ) {
    throw new Error("Profile media destination fence is invalid");
  }
  if (destinationPath) assertOwnerPath(destinationPath, ownerId);
  if (destinationThumbnailPath) assertOwnerPath(destinationThumbnailPath, ownerId);

  const sourceObjects = uniqueObjects([
    { bucket: sourceBucket, path: sourcePath },
    sourceThumbnailPath ? { bucket: sourceBucket, path: sourceThumbnailPath } : null,
  ]);
  const destinationObjects = uniqueObjects([
    destinationBucket && destinationPath
      ? { bucket: destinationBucket, path: destinationPath }
      : null,
    destinationBucket && destinationThumbnailPath
      ? { bucket: destinationBucket, path: destinationThumbnailPath }
      : null,
  ]);

  return {
    photoId,
    operationId,
    action,
    destinationBucket,
    destinationPath,
    destinationThumbnailPath,
    sourceObjects,
    destinationObjects,
  };
}

async function operationState(
  supabase: SupabaseClient,
  operation: ParsedProfileMediaOperation,
) {
  const { photoId, operationId, action } = operation;

  const { data, error } = await supabase.rpc(
    "profile_media_operation_state",
    {
      p_photo_id: photoId,
      p_operation_id: operationId,
      p_action: action,
    },
  );
  if (error) throw error;
  if (data !== "pending" && data !== "publish" && data !== "finalized" && data !== "stale") {
    throw new Error("Profile media operation state is invalid");
  }
  return data;
}

async function reconcileFailedFinalization(
  supabase: SupabaseClient,
  operation: ParsedProfileMediaOperation,
  failure: unknown,
) {
  const state = await operationState(supabase, operation);
  if (state === "finalized") {
    await removeObjects(supabase, operation.sourceObjects);
    return;
  }
  if (state === "publish") throw new Error("Unexpected public profile media publication state");
  await removeObjects(supabase, operation.destinationObjects);
  if (state === "pending") throw failure;
}

async function copyDestination(
  supabase: SupabaseClient,
  operation: ParsedProfileMediaOperation,
) {
  const { sourceObjects, destinationObjects } = operation;
  await removeObjects(supabase, destinationObjects);
  try {
    await copyObject(supabase, sourceObjects[0], destinationObjects[0]);
    if (sourceObjects[1] && destinationObjects[1]) {
      await copyObject(supabase, sourceObjects[1], destinationObjects[1]);
    }
  } catch (copyError) {
    await removeObjects(supabase, destinationObjects);
    throw copyError;
  }
}

function validFinalizerResult(value: unknown) {
  return Boolean(value && typeof value === "object" && !("error" in value));
}

export async function cleanupProfileMediaModerationOnDeadLetter(
  supabase: SupabaseClient,
  event: ProfileMediaEvent,
) {
  const operation = parseProfileMediaOperation(event);
  const state = await operationState(supabase, operation);
  if (state === "publish") {
    // An approved public row depends on this live operation and its quarantined
    // source. Preserve both and keep retrying until publication completes.
    return false;
  }
  if (state === "pending") {
    // Pending operations still own their durable source and decision. Remove
    // any uncertain destination, but never strand the active fence as dead.
    await removeObjects(supabase, operation.destinationObjects);
    return false;
  }
  if (state === "finalized") {
    await removeObjects(supabase, operation.sourceObjects);
    return true;
  }
  await removeObjects(supabase, operation.destinationObjects);
  return true;
}

export async function handleProfileMediaModeration(
  supabase: SupabaseClient,
  event: ProfileMediaEvent,
) {
  const operation = parseProfileMediaOperation(event);
  const {
    photoId,
    operationId,
    action,
    destinationBucket,
    destinationPath,
    destinationThumbnailPath,
    sourceObjects,
    destinationObjects,
  } = operation;
  let currentState = await operationState(supabase, operation);
  if (currentState === "finalized") {
    await removeObjects(supabase, sourceObjects);
    return;
  }
  if (currentState === "stale") {
    await removeObjects(supabase, destinationObjects);
    return;
  }

  const publicPromotion = action === "approve"
    && destinationBucket === APPROVED_PROFILE_PHOTOS_BUCKET;

  const canonicalUrl = destinationBucket && destinationPath
    ? supabase.storage.from(destinationBucket).getPublicUrl(destinationPath).data.publicUrl
    : null;
  const canonicalThumbnailUrl = destinationBucket && destinationThumbnailPath
    ? supabase.storage.from(destinationBucket).getPublicUrl(destinationThumbnailPath).data.publicUrl
    : null;

  if (publicPromotion) {
    if (currentState === "pending") {
      let authorizationFailure: unknown = null;
      try {
        const response = await supabase.rpc(
          "finalize_profile_media_moderation",
          {
            p_photo_id: photoId,
            p_operation_id: operationId,
            p_action: action,
            p_storage_bucket: destinationBucket,
            p_storage_path: destinationPath,
            p_thumbnail_storage_path: destinationThumbnailPath,
            p_url: canonicalUrl,
            p_thumbnail_url: canonicalThumbnailUrl,
          },
        );
        if (response.error) authorizationFailure = response.error;
        else if (!validFinalizerResult(response.data)) {
          authorizationFailure = new Error("Profile media finalization failed");
        }
      } catch (error) {
        authorizationFailure = error;
      }

      currentState = await operationState(supabase, operation);
      if (currentState === "finalized") {
        await removeObjects(supabase, sourceObjects);
        return;
      }
      if (currentState === "stale") {
        await removeObjects(supabase, destinationObjects);
        return;
      }
      if (currentState !== "publish") {
        await removeObjects(supabase, destinationObjects);
        throw authorizationFailure ?? new Error("Profile media publication was not authorized");
      }
    }

    if (currentState !== "publish") {
      throw new Error("Public profile media publication state is invalid");
    }

    // The exact operation is now authoritatively approved and references this
    // destination. Only after that transaction may an object enter the public bucket.
    await copyDestination(supabase, operation);

    let completionFailure: unknown = null;
    try {
      const response = await supabase.rpc("complete_profile_media_publication", {
        p_photo_id: photoId,
        p_operation_id: operationId,
      });
      if (response.error) completionFailure = response.error;
      else if (!validFinalizerResult(response.data)) {
        completionFailure = new Error("Profile media publication completion failed");
      }
    } catch (error) {
      completionFailure = error;
    }
    if (completionFailure) {
      const reconciledState = await operationState(supabase, operation);
      if (reconciledState === "finalized") {
        await removeObjects(supabase, sourceObjects);
        return;
      }
      if (reconciledState === "stale") {
        await removeObjects(supabase, destinationObjects);
        return;
      }
      await removeObjects(supabase, destinationObjects);
      throw completionFailure;
    }

    await removeObjects(supabase, sourceObjects);
    return;
  }

  if (currentState === "publish") {
    throw new Error("Non-public profile media cannot enter publication state");
  }

  if (action === "reject") {
    await removeObjects(supabase, sourceObjects);
  } else {
    await copyDestination(supabase, operation);
  }

  let finalized: unknown;
  let finalizeError: unknown;
  try {
    const response = await supabase.rpc(
      "finalize_profile_media_moderation",
      {
        p_photo_id: photoId,
        p_operation_id: operationId,
        p_action: action,
        p_storage_bucket: destinationBucket,
        p_storage_path: destinationPath,
        p_thumbnail_storage_path: destinationThumbnailPath,
        p_url: canonicalUrl,
        p_thumbnail_url: canonicalThumbnailUrl,
      },
    );
    finalized = response.data;
    finalizeError = response.error;
  } catch (error) {
    finalizeError = error;
  }
  if (finalizeError) {
    await reconcileFailedFinalization(supabase, operation, finalizeError);
    return;
  }
  if (!validFinalizerResult(finalized)) {
    await reconcileFailedFinalization(
      supabase,
      operation,
      new Error("Profile media finalization failed"),
    );
    return;
  }

  if (action !== "reject") await removeObjects(supabase, sourceObjects);
}
