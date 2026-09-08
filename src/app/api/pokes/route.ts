import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { idempotencyKey } from "@/lib/api-contract";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import { pokeCreateRequestSchema } from "@peekpoke/shared";
import { createPoke, readPokes } from "@/features/social/server/pokes";
import { apiError } from "@/lib/api-error";
import { trackProductEvent } from "@/lib/server-analytics";

function readLimit(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return 20;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const limit = Number(raw);
  return limit >= 1 && limit <= 100 ? limit : null;
}

export const GET = withAuth(async (request, { user }) => {
  const limit = readLimit(request);
  if (limit === null)
    return apiError("Invalid limit", 400, "INVALID_PAGINATION");
  const result = await readPokes(user.id, limit);
  return (
    result.error ??
    NextResponse.json(result.data, { headers: { "cache-control": "no-store" } })
  );
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
  const limited = await enforceRateLimit("pokeCreate", user.id);
  if (limited) return limited;
  const [body, error] = await parseBody(request, pokeCreateRequestSchema);
  if (error) return error;
  const result = await createPoke(user.id, body, idempotency.key);
  if (!result.error && !result.data.replayed)
    trackProductEvent({ name: "poke_sent", activity: body.activity });
  return (
    result.error ??
    NextResponse.json(result.data, {
      headers: {
        "cache-control": "no-store",
        "idempotency-key": idempotency.key,
      },
    })
  );
});
