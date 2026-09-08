import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import { availabilityUpsertRequestSchema } from "@peekpoke/shared";
import {
  clearAvailability,
  readAvailability,
  upsertAvailability,
} from "@/features/social/server/intent";
import { trackProductEvent } from "@/lib/server-analytics";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { recordAvailabilityActivation, recordProductMetrics } from "@/lib/server-product-metrics";

function readOptions(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get("limit");
  const limit = raw === null ? 20 : /^\d{1,3}$/.test(raw) ? Number(raw) : null;
  const radiusRaw = params.get("radiusKm");
  const radiusKm =
    radiusRaw === null
      ? 25
      : /^\d{1,2}$/.test(radiusRaw)
        ? Number(radiusRaw)
        : null;
  const discoveryContextRaw = params.get("discovery_context");
  const discoveryContext = discoveryContextRaw === null ? false : discoveryContextRaw === "1";
  if (
    limit === null ||
    radiusKm === null ||
    (discoveryContextRaw !== null && discoveryContextRaw !== "1") ||
    limit < 1 ||
    limit > 100 ||
    radiusKm < 2 ||
    radiusKm > 25
  )
    return null;
  return { limit, radiusKm, discoveryContext };
}

export const GET = withNoStore(withAuth(async (request, { user }) => {
  const options = readOptions(request);
  if (options === null)
    return apiError("Choose a valid discovery radius and result limit", 400, "INVALID_PAGINATION");
  const result = await readAvailability(
    user.id,
    options.limit,
    options.radiusKm,
    options.discoveryContext,
  );
  if (!result.error) recordProductMetrics(user.id, result.data.people);
  return result.error ?? NextResponse.json(result.data, { headers: { "cache-control": "no-store" } });
}));

export const PUT = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("availabilityMutation", user.id);
  if (limited) return limited;
  const [body, error] = await parseBody(
    request,
    availabilityUpsertRequestSchema,
  );
  if (error) return error;
  const result = await upsertAvailability(user.id, body);
  if (!result.error)
    trackProductEvent({
      name: "availability_created",
      activity: body.activity,
    });
  if (!result.error) recordAvailabilityActivation(user.id);
  return (
    result.error ??
    NextResponse.json(result.data, { headers: { "cache-control": "no-store" } })
  );
}));

export const DELETE = withNoStore(withAuth(async (_request, { user }) => {
  const limited = await enforceRateLimit("availabilityMutation", user.id);
  if (limited) return limited;
  const result = await clearAvailability(user.id);
  return (
    result.error ??
    NextResponse.json(result.data, { headers: { "cache-control": "no-store" } })
  );
}));
