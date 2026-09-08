import {
  planCreateRequestSchema,
  planCreateResponseSchema,
  planJoinResponseSchema,
  planLeaveResponseSchema,
  planPatchRequestSchema,
  planReadResponseSchema,
  planShareCreateRequestSchema,
  planShareCreateResponseSchema,
  planShareRevokeResponseSchema,
  plansReadResponseSchema,
  type PlanCreateRequest,
  type PlanJoinRequest,
  type PlanPatchRequest,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function fetchPlans(signal?: AbortSignal) {
  return fetchContract("/api/plans", plansReadResponseSchema, { signal });
}

export function createPlan(
  input: PlanCreateRequest,
  idempotencyKey = crypto.randomUUID(),
) {
  const body = planCreateRequestSchema.parse(input);
  return fetchContract("/api/plans", planCreateResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export function fetchPlan(planId: string, signal?: AbortSignal) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}`,
    planReadResponseSchema,
    { signal },
  );
}

export function updatePlan(planId: string, input: PlanPatchRequest) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}`,
    planReadResponseSchema,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(planPatchRequestSchema.parse(input)),
    },
  );
}

export function cancelPlan(planId: string) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}`,
    planReadResponseSchema,
    { method: "DELETE" },
  );
}

export function joinPlan(
  planId: string,
  input: PlanJoinRequest = {},
  idempotencyKey = crypto.randomUUID(),
) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}/join`,
    planJoinResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
}

export function createPlanShare(planId: string) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}/share`,
    planShareCreateResponseSchema,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(planShareCreateRequestSchema.parse({})),
    },
  );
}

export function leavePlan(planId: string) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}/join`,
    planLeaveResponseSchema,
    { method: "DELETE" },
  );
}

export function revokePlanShares(planId: string) {
  return fetchContract(
    `/api/plans/${encodeURIComponent(planId)}/share`,
    planShareRevokeResponseSchema,
    { method: "DELETE" },
  );
}
