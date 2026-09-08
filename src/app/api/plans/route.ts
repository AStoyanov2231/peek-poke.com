import { withAuth } from "@/lib/auth";
import { parseBody } from "@/lib/validators";
import { idempotencyKey } from "@/lib/api-contract";
import { apiError } from "@/lib/api-error";
import { trackProductEvent } from "@/lib/server-analytics";
import {
  noStoreJson,
  planFailure,
  planUnavailable,
} from "@/features/plans/server/response";
import { createPlan, listPlans } from "@/features/plans/server/plans";
import { planCreateRequestSchema } from "@peekpoke/shared/plans";

export const GET = withAuth(async (_request, { user }) => {
  const result = await listPlans(user.id);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});

export const POST = withAuth(async (request, { user }) => {
  const [body, error] = await parseBody(request, planCreateRequestSchema);
  if (error) return error;
  const key = idempotencyKey(request);
  if (key.error) return key.error;
  if (!key.key)
    return apiError(
      "Idempotency key is required",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  const result = await createPlan(user.id, body, key.key);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  if (!result.data.replayed)
    trackProductEvent({
      name: "plan_created",
      activity: body.activity,
      visibility: body.visibility,
    });
  const response = noStoreJson(result.data, {
    status: result.data.replayed ? 200 : 201,
  });
  response.headers.set("idempotency-key", key.key);
  return response;
});
