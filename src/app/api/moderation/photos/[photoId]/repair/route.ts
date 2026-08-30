import { NextResponse } from "next/server";
import { requireModeratorRole, withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { idempotencyKey, mapModerationPhoto } from "@/lib/api-contract";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { signPrivateProfilePhotos } from "@/lib/storage-urls";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { parseBody, profileMediaRemediationSchema } from "@/lib/validators";

export const POST = withNoStore(withAuth<{ photoId: string }>(async (
  request,
  { user, supabase, params },
) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const limited = await enforceRateLimit("moderation", user.id);
  if (limited) return limited;

  if (!isValidUUID(params.photoId)) {
    return apiError("Invalid photo ID", 400, "INVALID_PHOTO_ID");
  }
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;

  const [body, bodyError] = await parseBody(request, profileMediaRemediationSchema);
  if (bodyError) return bodyError;

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc("resolve_profile_media_remediation", {
    p_photo_id: params.photoId,
    p_operation_id: body.operation_id,
    p_operator_id: user.id,
    p_resolution: body.resolution,
    p_note: body.note ?? null,
  });
  if (error) {
    console.error("moderation/photos/[photoId]/repair:", error);
    if (error.code === "PGRST202" || error.code === "42883") {
      return apiError("Photo remediation is temporarily unavailable", 503, "MODERATION_UNAVAILABLE");
    }
    return apiError("Internal server error", 500, "MEDIA_REMEDIATION_FAILED");
  }

  const photo = data as unknown as Record<string, unknown> | null;
  if (typeof photo?.error === "string") {
    const status = typeof photo.status === "number" ? photo.status : 409;
    const codes = new Set([
      "PHOTO_NOT_FOUND",
      "REMEDIATION_NOT_FOUND",
      "REMEDIATION_ALREADY_RESOLVED",
      "STALE_MEDIA_OPERATION",
      "REMEDIATION_SNAPSHOT_MISSING",
      "REMEDIATION_SNAPSHOT_DIGEST_MISMATCH",
      "REMEDIATION_PAYLOAD_INVALID",
    ]);
    const code = codes.has(photo.error) ? photo.error : "MEDIA_REMEDIATION_FAILED";
    return apiError("Photo remediation requires operator review", status, code);
  }
  if (!photo) return apiError("Photo not found", 404, "PHOTO_NOT_FOUND");

  const queueState = photo._moderation_queue_state;
  const remediationState = photo._remediation_state;
  const reconstructed = remediationState === "reconstructed"
    && ["pending", "processing", "publish", "finalized"].includes(String(queueState));
  const queued = queueState === "pending" || queueState === "processing";
  const reset = remediationState === "decision_reset" && photo.moderation_action === null;
  if (!reconstructed && !reset) {
    return apiError("Photo remediation did not converge", 409, "MEDIA_REMEDIATION_FAILED");
  }

  const [responsePhoto] = await signPrivateProfilePhotos(serviceClient, [photo]);
  return NextResponse.json(
    {
      photo: mapModerationPhoto(responsePhoto),
      remediation_state: remediationState,
    },
    {
      status: reconstructed && queued ? 202 : 200,
      headers: idempotency.key ? { "idempotency-key": idempotency.key } : undefined,
    },
  );
}));
