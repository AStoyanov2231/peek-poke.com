import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { idempotencyKey } from "@/lib/api-contract";
import { isValidUUID } from "@/lib/validation";
import { parseBody } from "@/lib/validators";
import { joinPlan, leavePlan } from "@/features/plans/server/plans";
import {
  noStoreJson,
  planFailure,
  planUnavailable,
} from "@/features/plans/server/response";
import { planJoinRequestSchema } from "@peekpoke/shared/plans";

type Params = { planId: string };
export const POST = withAuth<Params>(async (request, { user, params }) => {
  if (!isValidUUID(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const key = idempotencyKey(request);
  if (key.error) return key.error;
  if (!key.key)
    return apiError(
      "Idempotency key is required",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  const [body, error] = await parseBody(request, planJoinRequestSchema);
  if (error) return error;
  const result = await joinPlan(user.id, params.planId, key.key, body);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  const response = noStoreJson(result.data);
  response.headers.set("idempotency-key", key.key);
  return response;
});

export const DELETE = withAuth<Params>(async (_request, { user, params }) => {
  if (!isValidUUID(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const result = await leavePlan(user.id, params.planId);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});
