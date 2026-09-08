import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { idempotencyKey } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import { pokeResponseRequestSchema } from "@peekpoke/shared";
import { respondToPoke } from "@/features/social/server/pokes";
import { trackProductEvent } from "@/lib/server-analytics";

export const PATCH = withAuth<{ pokeId: string }>(
  async (request, { user, params }) => {
    if (!z.uuid().safeParse(params.pokeId).success)
      return apiError("Invalid poke ID", 400, "VALIDATION_ERROR");
    const idempotency = idempotencyKey(request);
    if (idempotency.error) return idempotency.error;
    if (!idempotency.key)
      return apiError(
        "Idempotency key is required",
        400,
        "INVALID_IDEMPOTENCY_KEY",
      );
    const limited = await enforceRateLimit("pokeResponse", user.id);
    if (limited) return limited;
    const [body, error] = await parseBody(request, pokeResponseRequestSchema);
    if (error) return error;
    const result = await respondToPoke(
      user.id,
      params.pokeId,
      body,
      idempotency.key,
    );
    if (
      !result.error &&
      !result.data.replayed &&
      result.data.poke.status === "accepted"
    ) {
      trackProductEvent({
        name: "poke_accepted",
        activity: result.data.poke.activity,
      });
    }
    return (
      result.error ??
      NextResponse.json(result.data, {
        headers: {
          "cache-control": "no-store",
          "idempotency-key": idempotency.key,
        },
      })
    );
  },
);
