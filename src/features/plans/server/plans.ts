import { createHash } from "node:crypto";
import { z } from "zod";
import {
  planCreateResponseSchema,
  planJoinResponseSchema,
  planLeaveResponseSchema,
  planMeetupStatusResponseSchema,
  planReadResponseSchema,
  planShareCreateResponseSchema,
  planShareRevokeResponseSchema,
  plansReadResponseSchema,
  publicPlanPreviewSchema,
  type PlanCreateRequest,
  type PlanJoinRequest,
  type PlanMeetupRequest,
  type PlanPatchRequest,
} from "@peekpoke/shared/plans";
import { createServiceClient } from "@/lib/supabase/server";

const rpcErrorSchema = z.strictObject({ error: z.string().min(1).max(64) });

export type PlanRpcFailure =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "BLOCKED"
  | "FULL"
  | "CANCELLED"
  | "EXPIRED"
  | "LOCATION_REQUIRED"
  | "MEETUP_CLOSED"
  | "MEETUP_NOT_READY"
  | "INVALID"
  | "IDEMPOTENCY_CONFLICT";
type PlanResult<T> =
  | { data: T; failure?: never; unavailable?: never }
  | { failure: PlanRpcFailure; data?: never; unavailable?: never }
  | { unavailable: true; data?: never; failure?: never };

export function planJoinHash(
  actorId: string,
  planId: string,
  body: PlanJoinRequest,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor_id: actorId,
        operation: "plan:join",
        plan_id: planId,
        share_token: body.share_token ?? null,
      }),
    )
    .digest("hex");
}

export function planCreateHash(actorId: string, body: PlanCreateRequest) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor_id: actorId,
        operation: "plan:create",
        activity: body.activity,
        title: body.title ?? null,
        starts_at: body.starts_at,
        place_text: body.place_text,
        visibility: body.visibility,
        circle_id: body.circle_id ?? null,
        participant_limit: body.participant_limit ?? 8,
        source_thread_id: body.source_thread_id ?? null,
        nearby_discovery: body.nearby_discovery ?? false,
      }),
    )
    .digest("hex");
}

export function planMeetupHash(
  actorId: string,
  planId: string,
  body: PlanMeetupRequest,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor_id: actorId,
        operation: "plan:meetup:acknowledge",
        plan_id: planId,
        peer_id: body.peerId,
      }),
    )
    .digest("hex");
}

function result<T>(data: unknown, schema: z.ZodType<T>): PlanResult<T> {
  const failure = rpcErrorSchema.safeParse(data);
  if (failure.success)
    return { failure: failure.data.error as PlanRpcFailure } as const;
  const parsed = schema.safeParse(data);
  return parsed.success
    ? ({ data: parsed.data } as const)
    : { failure: "INVALID" as const };
}

async function invoke<T>(
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<PlanResult<T>> {
  const { data, error } = await createServiceClient().rpc(name, args);
  if (error) {
    console.error(`plans: ${name} failed`, error);
    return { unavailable: true } as const;
  }
  return result(data, schema);
}

export function createPlan(
  actorId: string,
  body: PlanCreateRequest,
  idempotencyKey: string,
) {
  return invoke(
    "plan_create_v2",
    {
      p_actor_id: actorId,
      p_activity: body.activity,
      p_title: body.title ?? null,
      p_starts_at: body.starts_at,
      p_place_text: body.place_text,
      p_visibility: body.visibility,
      p_circle_id: body.circle_id ?? null,
      p_participant_limit: body.participant_limit ?? 8,
      p_source_thread_id: body.source_thread_id ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_hash: planCreateHash(actorId, body),
      p_nearby_discovery: body.nearby_discovery ?? false,
    },
    planCreateResponseSchema,
  );
}

export function leavePlan(actorId: string, planId: string) {
  return invoke(
    "plan_leave_v1",
    { p_actor_id: actorId, p_plan_id: planId },
    planLeaveResponseSchema,
  );
}

export function listPlans(actorId: string) {
  return invoke(
    "plans_list_v2",
    { p_actor_id: actorId },
    plansReadResponseSchema,
  );
}

export function readPlan(actorId: string, planId: string) {
  return invoke(
    "plan_read_v1",
    { p_actor_id: actorId, p_plan_id: planId },
    planReadResponseSchema,
  );
}

export function readPlanMeetupStatus(actorId: string, planId: string) {
  return invoke(
    "plan_meetup_status_v1",
    { p_actor_id: actorId, p_plan_id: planId },
    planMeetupStatusResponseSchema,
  );
}

export function acknowledgePlanMeetup(
  actorId: string,
  planId: string,
  body: PlanMeetupRequest,
  idempotencyKey: string,
) {
  return invoke(
    "plan_meetup_acknowledge_v1",
    {
      p_actor_id: actorId,
      p_plan_id: planId,
      p_peer_id: body.peerId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: planMeetupHash(actorId, planId, body),
    },
    planMeetupStatusResponseSchema,
  );
}

export function updatePlan(
  actorId: string,
  planId: string,
  body: PlanPatchRequest,
) {
  return invoke(
    "plan_update_v1",
    {
      p_actor_id: actorId,
      p_plan_id: planId,
      p_patch: body,
    },
    planReadResponseSchema,
  );
}

export function cancelPlan(actorId: string, planId: string) {
  return invoke(
    "plan_cancel_v1",
    { p_actor_id: actorId, p_plan_id: planId },
    planReadResponseSchema,
  );
}

export function joinPlan(
  actorId: string,
  planId: string,
  idempotencyKey: string,
  body: PlanJoinRequest,
) {
  return invoke(
    "plan_join_v1",
    {
      p_actor_id: actorId,
      p_plan_id: planId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: planJoinHash(actorId, planId, body),
      p_share_token: body.share_token ?? null,
    },
    planJoinResponseSchema,
  );
}

export function createPlanShare(
  actorId: string,
  planId: string,
  expiresAt: string | null,
) {
  return invoke(
    "plan_share_create_v1",
    {
      p_actor_id: actorId,
      p_plan_id: planId,
      p_expires_at: expiresAt,
    },
    planShareCreateResponseSchema,
  );
}

export function revokePlanShares(actorId: string, planId: string) {
  return invoke(
    "plan_share_revoke_v1",
    { p_actor_id: actorId, p_plan_id: planId },
    planShareRevokeResponseSchema,
  );
}

export function readPublicPlanPreview(token: string) {
  return invoke(
    "plan_public_preview_v1",
    { p_token: token },
    publicPlanPreviewSchema,
  );
}
