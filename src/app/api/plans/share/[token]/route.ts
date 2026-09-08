import { apiError } from "@/lib/api-error";
import { readPublicPlanPreview } from "@/features/plans/server/plans";
import {
  noStoreJson,
  planFailure,
  planUnavailable,
} from "@/features/plans/server/response";
import { PLAN_SHARE_TOKEN_LENGTH } from "@peekpoke/shared/plans";

type Params = { token: string };
export async function GET(
  _request: Request,
  routeContext: { params: Promise<Params> },
) {
  const { token } = await routeContext.params;
  if (!new RegExp(`^[A-Za-z0-9_-]{${PLAN_SHARE_TOKEN_LENGTH}}$`).test(token)) {
    return apiError("Plan not found", 404, "PLAN_NOT_FOUND");
  }
  const result = await readPublicPlanPreview(token);
  if ("unavailable" in result) return planUnavailable();
  if (result.failure) return planFailure(result.failure);
  return noStoreJson(result.data);
}
