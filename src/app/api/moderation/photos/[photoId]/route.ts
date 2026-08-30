import { NextResponse } from "next/server";
import { withAuth, requireModeratorRole } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { moderationActionSchema, parseBody } from "@/lib/validators";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { signPrivateProfilePhotos } from "@/lib/storage-urls";
import { idempotencyKey, mapModerationPhoto } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";

export const PATCH = withNoStore(withAuth<{ photoId: string }>(async (request, { user, supabase, params }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const limited = await enforceRateLimit("moderation", user.id);
  if (limited) return limited;

  const { photoId } = params;

  if (!isValidUUID(photoId)) {
    return apiError("Invalid photo ID", 400, "INVALID_PHOTO_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;

  const [body, err] = await parseBody(request, moderationActionSchema);
  if (err) return err;

  const { action, reason } = body;

  const serviceClient = createServiceClient();
  const { data: rawPhoto, error } = await serviceClient.rpc("request_profile_media_moderation", {
    p_photo_id: photoId,
    p_reviewer_id: user.id,
    p_action: action,
    p_reason: action === "reject" ? reason?.trim() ?? null : null,
  });

  if (error) {
    console.error("moderation/photos/[photoId]:", error);
    if (error.code === "PGRST202" || error.code === "42883") {
      return apiError("Photo moderation is temporarily unavailable", 503, "MODERATION_UNAVAILABLE");
    }
    return apiError("Internal server error", 500, "MODERATION_REVIEW_FAILED");
  }

  const photo = rawPhoto as unknown as Record<string, unknown> | null;
  if (typeof photo?.error === "string") {
    const status = typeof photo.status === "number" ? photo.status : 400;
    if (photo.error === "PHOTO_NOT_FOUND") {
      return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
    }
    if (photo.error === "MODERATION_IN_PROGRESS") {
      return apiError("Another moderation action is still processing", 409, "MODERATION_IN_PROGRESS");
    }
    if (photo.error === "PHOTO_MEDIA_MISSING") {
      return apiError("Rejected media must be uploaded again before approval", 409, "PHOTO_MEDIA_MISSING");
    }
    if (photo.error === "MEDIA_EVENT_CONFLICT") {
      return apiError("Photo moderation queue is inconsistent", 409, "MEDIA_EVENT_CONFLICT");
    }
    if (photo.error === "MEDIA_REMEDIATION_REQUIRED") {
      return NextResponse.json(
        {
          error: "Photo moderation requires operator remediation",
          code: "MEDIA_REMEDIATION_REQUIRED",
          operation_id: typeof photo.operation_id === "string" ? photo.operation_id : null,
        },
        { status: 409 },
      );
    }
    return apiError("Photo moderation could not be queued", status, "MODERATION_REVIEW_FAILED");
  }
  if (!photo) {
    return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");
  }

  const queued = photo._moderation_queue_state === "pending"
    || photo._moderation_queue_state === "processing";
  if (photo.moderation_action === action && !queued) {
    return apiError("Photo moderation queue is inconsistent", 409, "MEDIA_EVENT_CONFLICT");
  }
  const [responsePhoto] = await signPrivateProfilePhotos(serviceClient, [photo]);
  return NextResponse.json(
    { photo: mapModerationPhoto(responsePhoto) },
    {
      status: queued ? 202 : 200,
      headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
    },
  );
}));
