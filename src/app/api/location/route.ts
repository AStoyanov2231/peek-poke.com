import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { coordsSchema, parseBody } from "@/lib/validators";
import { locationUpdateResponseSchema } from "@peekpoke/shared";
import { verifyLocationAttestation } from "@/lib/location-attestation";

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("location", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(request, coordsSchema);
  if (bodyError) return bodyError;

  const attestation = verifyLocationAttestation(
    request.headers.get("x-location-attestation"),
    user.id,
    body,
  );
  if (!attestation) {
    return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
  }

  const { data, error } = await createServiceClient().rpc("upsert_user_location", {
    p_user_id: user.id,
    p_lat: body.lat,
    p_lng: body.lng,
    p_nonce_hash: attestation.nonceHash,
    p_issued_at: attestation.issuedAt,
  });
  if (error) {
    console.error("location: update failed", error);
    return apiError("Location update is temporarily unavailable", 503, "LOCATION_UPDATE_UNAVAILABLE");
  }

  const response = locationUpdateResponseSchema.safeParse(data);
  if (!response.success) {
    console.error("location: malformed update response");
    return apiError("Location update is temporarily unavailable", 503, "LOCATION_UPDATE_UNAVAILABLE");
  }
  return NextResponse.json(response.data);
}));
