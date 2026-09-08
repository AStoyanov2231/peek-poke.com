import { randomUUID } from "expo-crypto";
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
  publicPlanPreviewSchema,
  type PlanCreateRequest,
  type PlanCreateResponse,
  type PlanJoinResponse,
  type PlanPatchRequest,
  type PlanReadResponse,
  type PlansReadResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function fetchPlans(signal?: AbortSignal): Promise<PlansReadResponse> {
  return apiFetch<PlansReadResponse>("/api/plans", {
    signal,
    responseSchema: plansReadResponseSchema,
  });
}

export function createPlan(
  request: PlanCreateRequest,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<PlanCreateResponse> {
  return apiFetch<PlanCreateResponse>("/api/plans", {
    method: "POST",
    body: jsonBody(planCreateRequestSchema.parse(request)),
    signal: options.signal,
    headers: { "idempotency-key": options.idempotencyKey ?? randomUUID() },
    responseSchema: planCreateResponseSchema,
  });
}

export function fetchPlan(
  planId: string,
  signal?: AbortSignal,
): Promise<PlanReadResponse> {
  return apiFetch<PlanReadResponse>(
    `/api/plans/${encodeURIComponent(planId)}`,
    { signal, responseSchema: planReadResponseSchema },
  );
}

export function joinPlan(
  planId: string,
  signal?: AbortSignal,
): Promise<PlanJoinResponse> {
  return apiFetch<PlanJoinResponse>(
    `/api/plans/${encodeURIComponent(planId)}/join`,
    {
      method: "POST",
      body: jsonBody({}),
      signal,
      headers: { "idempotency-key": randomUUID() },
      responseSchema: planJoinResponseSchema,
    },
  );
}

export function updatePlan(
  planId: string,
  request: PlanPatchRequest,
  signal?: AbortSignal,
): Promise<PlanReadResponse> {
  return apiFetch<PlanReadResponse>(
    `/api/plans/${encodeURIComponent(planId)}`,
    {
      method: "PATCH",
      body: jsonBody(planPatchRequestSchema.parse(request)),
      signal,
      responseSchema: planReadResponseSchema,
    },
  );
}

export function cancelPlan(
  planId: string,
  signal?: AbortSignal,
): Promise<PlanReadResponse> {
  return apiFetch<PlanReadResponse>(
    `/api/plans/${encodeURIComponent(planId)}`,
    {
      method: "DELETE",
      signal,
      responseSchema: planReadResponseSchema,
    },
  );
}

export function leavePlan(
  planId: string,
  signal?: AbortSignal,
): Promise<{ left: true }> {
  return apiFetch<{ left: true }>(
    `/api/plans/${encodeURIComponent(planId)}/join`,
    {
      method: "DELETE",
      signal,
      responseSchema: planLeaveResponseSchema,
    },
  );
}

export function createPlanShare(
  planId: string,
  signal?: AbortSignal,
): Promise<{ token: string; expires_at: string | null }> {
  return apiFetch<{ token: string; expires_at: string | null }>(
    `/api/plans/${encodeURIComponent(planId)}/share`,
    {
      method: "POST",
      body: jsonBody(planShareCreateRequestSchema.parse({})),
      signal,
      responseSchema: planShareCreateResponseSchema,
    },
  );
}

export function revokePlanShares(
  planId: string,
  signal?: AbortSignal,
): Promise<{ revoked: true }> {
  return apiFetch<{ revoked: true }>(
    `/api/plans/${encodeURIComponent(planId)}/share`,
    {
      method: "DELETE",
      signal,
      responseSchema: planShareRevokeResponseSchema,
    },
  );
}

export type PublicPlanPreview = {
  plan: {
    id: string;
    activity: string;
    title: string | null;
    starts_at: string;
    place_text: string;
    participant_limit: number;
    member_count: number;
  };
  can_join: boolean;
};

export function fetchPublicPlanPreview(
  token: string,
  signal?: AbortSignal,
): Promise<PublicPlanPreview> {
  return apiFetch<PublicPlanPreview>(
    `/api/plans/share/${encodeURIComponent(token)}`,
    {
      auth: false,
      signal,
      responseSchema: publicPlanPreviewSchema,
    },
  );
}

export function joinSharedPlan(
  planId: string,
  token: string,
  signal?: AbortSignal,
): Promise<PlanJoinResponse> {
  return apiFetch<PlanJoinResponse>(
    `/api/plans/${encodeURIComponent(planId)}/join`,
    {
      method: "POST",
      body: jsonBody({ share_token: token }),
      signal,
      headers: { "idempotency-key": randomUUID() },
      responseSchema: planJoinResponseSchema,
    },
  );
}
