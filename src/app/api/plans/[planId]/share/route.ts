import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { parseBody } from "@/lib/validators";
import {
  createPlanShare,
  revokePlanShares,
} from "@/features/plans/server/plans";
import {
  noStoreJson,
  planFailure,
  planUnavailable,
} from "@/features/plans/server/response";
import { planShareCreateRequestSchema } from "@peekpoke/shared/plans";

type Params = { planId: string };
export const POST = withAuth<Params>(async (request, { user, params }) => {
  if (!isValidUUID(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const [body, error] = await parseBody(request, planShareCreateRequestSchema);
  if (error) return error;
  const result = await createPlanShare(
    user.id,
    params.planId,
    body.expires_at ?? null,
  );
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data, { status: 201 });
});

export const DELETE = withAuth<Params>(async (_request, { user, params }) => {
  if (!isValidUUID(params.planId))
    return apiError("Invalid plan ID", 400, "VALIDATION_ERROR");
  const result = await revokePlanShares(user.id, params.planId);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
});
