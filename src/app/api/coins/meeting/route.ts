import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorEnvelopeSchema,
  meetingRequestSchema,
  meetingResponseSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { idempotencyKey } from "@/lib/api-contract";
import { currentRequestId } from "@/lib/request-context";
import { parseBody } from "@/lib/validators";
import { MEETING_OPERATION, meetingHash } from "@/lib/meeting-idempotency";

const meetingRpcResultSchema = z.strictObject({
  response_status: z.number().int().min(200).max(599),
  response_body: z.unknown(),
  replayed: z.boolean(),
});

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("coinMeeting", user.id);
  if (limited) return limited;

  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key) {
    return apiError("Idempotency key is required", 400, "INVALID_IDEMPOTENCY_KEY");
  }

  const [body, bodyError] = await parseBody(request, meetingRequestSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("record_meeting_idempotent", {
    p_actor_id: user.id,
    p_friend_id: body.friend_id,
    p_operation: MEETING_OPERATION,
    p_idempotency_key: idempotency.key,
    p_request_hash: meetingHash(user.id, body.friend_id),
    p_request_id: currentRequestId() ?? null,
  });
  if (error) {
    console.error("coins/meeting: idempotent RPC unavailable", error);
    return apiError("Meeting service temporarily unavailable", 503, "MEETING_IDEMPOTENCY_UNAVAILABLE");
  }

  const result = meetingRpcResultSchema.safeParse(data);
  if (!result.success) {
    console.error("coins/meeting: malformed idempotent RPC result");
    return apiError("Meeting service temporarily unavailable", 503, "MEETING_IDEMPOTENCY_UNAVAILABLE");
  }

  const responseBody = result.data.response_status === 200
    ? meetingResponseSchema.safeParse(result.data.response_body)
    : apiErrorEnvelopeSchema.safeParse(result.data.response_body);
  if (!responseBody.success) {
    console.error("coins/meeting: malformed response contract");
    return apiError("Meeting service temporarily unavailable", 503, "MEETING_IDEMPOTENCY_UNAVAILABLE");
  }

  return NextResponse.json(responseBody.data, {
    status: result.data.response_status,
    headers: {
      "cache-control": "no-store",
      "idempotency-key": idempotency.key,
      "x-idempotency-replayed": result.data.replayed ? "true" : "false",
    },
  });
}));
