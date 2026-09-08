import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { parseBody } from "@/lib/validators";
import {
  cancelPlan,
  readPlan,
  updatePlan,
} from "@/features/plans/server/plans";
import {
  noStoreJson,
  planFailure,
  planUnavailable,
} from "@/features/plans/server/response";
import { planPatchRequestSchema } from "@peekpoke/shared/plans";

type Params = { planId: string };
function invalidPlanId(planId: string) {
  return !isValidUUID(planId);
}

export const GET = withAuth<Params>(async (_request, { user, params }) => {
  if (invalidPlanId(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const result = await readPlan(user.id, params.planId);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});

export const PATCH = withAuth<Params>(async (request, { user, params }) => {
  if (invalidPlanId(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const [body, error] = await parseBody(request, planPatchRequestSchema);
  if (error) return error;
  const result = await updatePlan(user.id, params.planId, body);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});

export const DELETE = withAuth<Params>(async (_request, { user, params }) => {
  if (invalidPlanId(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const result = await cancelPlan(user.id, params.planId);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});
