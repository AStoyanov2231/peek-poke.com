import { NextResponse } from "next/server";
import {
  meetupAcknowledgementResponseSchema,
  meetupAcknowledgementReadResponseSchema,
  meetupAcknowledgementRequestSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { idempotencyKey } from "@/lib/api-contract";
import {
  meetupAcknowledgementHash,
  MEETUP_ACKNOWLEDGEMENT_OPERATION,
} from "@/lib/meetup-acknowledgement-idempotency";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/validators";
import { trackProductEvent } from "@/lib/server-analytics";

export const GET = withAuth(async (request, { user }) => {
  const peerId = new URL(request.url).searchParams.get("peerId");
  if (
    !peerId ||
    !meetupAcknowledgementRequestSchema.shape.peerId.safeParse(peerId).success
  ) {
    return apiError("A valid peer ID is required", 400, "VALIDATION_ERROR");
  }
  const { data, error } = await createServiceClient().rpc(
    "read_meetup_acknowledgement",
    {
      p_actor_id: user.id,
      p_peer_id: peerId,
    },
  );
  if (error) {
    console.error("meetups/GET:", error);
    return apiError(
      "Meetup acknowledgements are temporarily unavailable",
      503,
      "MEETUP_UNAVAILABLE",
    );
  }
  const failure =
    typeof data === "object" && data !== null && "error" in data
      ? String(data.error)
      : null;
  if (failure)
    return apiError(
      "Meetup acknowledgement is unavailable for this connection",
      404,
      failure,
    );
  const parsed = meetupAcknowledgementReadResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.error("meetups/GET: invalid RPC response", parsed.error.flatten());
    return apiError(
      "Meetup acknowledgements are temporarily unavailable",
      503,
      "MEETUP_UNAVAILABLE",
    );
  }
  return NextResponse.json(parsed.data, {
    headers: { "cache-control": "no-store" },
  });
});

export const POST = withAuth(async (request, { user }) => {
  const idempotency = idempotencyKey(request);
  if (idempotency.error) return idempotency.error;
  if (!idempotency.key)
    return apiError(
      "Idempotency key is required",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  const limited = await enforceRateLimit("meetupAcknowledgement", user.id);
  if (limited) return limited;
  const [body, bodyError] = await parseBody(
    request,
    meetupAcknowledgementRequestSchema,
  );
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc(
    "acknowledge_meetup_idempotent",
    {
      p_actor_id: user.id,
      p_peer_id: body.peerId,
      p_operation: MEETUP_ACKNOWLEDGEMENT_OPERATION,
      p_idempotency_key: idempotency.key,
      p_request_hash: meetupAcknowledgementHash(user.id, body),
    },
  );
  if (error) {
    console.error("meetups/POST:", error);
    return apiError(
      "Meetup acknowledgement is temporarily unavailable",
      503,
      "MEETUP_UNAVAILABLE",
    );
  }
  const failure =
    typeof data === "object" && data !== null && "error" in data
      ? String(data.error)
      : null;
  if (failure) {
    return apiError(
      "Meetup acknowledgement is unavailable for this connection",
      failure === "NOT_ELIGIBLE" || failure === "BLOCKED" ? 403 : 400,
      failure,
    );
  }
  const confirmedTransition =
    typeof data === "object" &&
    data !== null &&
    "confirmed_transition" in data &&
    data.confirmed_transition === true;
  const responseData =
    typeof data === "object" && data !== null
      ? Object.fromEntries(
          Object.entries(data).filter(
            ([key]) => key !== "confirmed_transition",
          ),
        )
      : data;
  const parsed = meetupAcknowledgementResponseSchema.safeParse(responseData);
  if (!parsed.success) {
    console.error("meetups/POST: invalid RPC response", parsed.error.flatten());
    return apiError(
      "Meetup acknowledgement is temporarily unavailable",
      503,
      "MEETUP_UNAVAILABLE",
    );
  }
  if (confirmedTransition && !parsed.data.replayed)
    trackProductEvent({ name: "meet_created" });
  return NextResponse.json(parsed.data, {
    headers: {
      "cache-control": "no-store",
      "idempotency-key": idempotency.key,
    },
  });
});
