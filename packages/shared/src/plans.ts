import { z } from "zod";
import { idempotencyKeySchema, utcTimestampSchema } from "./contract";

export const PLAN_ACTIVITY_MAX_LENGTH = 48;
export const PLAN_PLACE_MAX_LENGTH = 160;
export const PLAN_TITLE_MAX_LENGTH = 96;
export const PLAN_PARTICIPANT_LIMIT_MAX = 50;
export const PLAN_SHARE_TOKEN_LENGTH = 43;

export const planVisibilitySchema = z.enum([
  "private",
  "friends",
  "circle",
  "open",
]);
export const planStatusSchema = z.enum(["active", "cancelled"]);
export const planMemberRoleSchema = z.enum(["owner", "member"]);

const safePlanText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u.test(value),
      "Text contains unsupported control characters",
    );

export const planCreateRequestSchema = z
  .strictObject({
    activity: safePlanText(PLAN_ACTIVITY_MAX_LENGTH),
    title: safePlanText(PLAN_TITLE_MAX_LENGTH).optional(),
    starts_at: utcTimestampSchema,
    place_text: safePlanText(PLAN_PLACE_MAX_LENGTH),
    visibility: planVisibilitySchema,
    circle_id: z.uuid().nullable().optional(),
    participant_limit: z
      .number()
      .int()
      .min(2)
      .max(PLAN_PARTICIPANT_LIMIT_MAX)
      .optional(),
    source_thread_id: z.uuid().optional(),
    nearby_discovery: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.visibility === "circle" && !value.circle_id) {
      context.addIssue({
        code: "custom",
        path: ["circle_id"],
        message: "A Circle is required for Circle-only plans",
      });
    }
    if (value.visibility !== "circle" && value.circle_id) {
      context.addIssue({
        code: "custom",
        path: ["circle_id"],
        message: "Circle is only allowed for Circle-only plans",
      });
    }
    if (Date.parse(value.starts_at) <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["starts_at"],
        message: "Plan time must be in the future",
      });
    }
  });

export const planPatchRequestSchema = z
  .strictObject({
    activity: safePlanText(PLAN_ACTIVITY_MAX_LENGTH).optional(),
    title: safePlanText(PLAN_TITLE_MAX_LENGTH).nullable().optional(),
    starts_at: utcTimestampSchema.optional(),
    place_text: safePlanText(PLAN_PLACE_MAX_LENGTH).optional(),
    visibility: planVisibilitySchema.optional(),
    circle_id: z.uuid().nullable().optional(),
    participant_limit: z
      .number()
      .int()
      .min(2)
      .max(PLAN_PARTICIPANT_LIMIT_MAX)
      .optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change",
  );

export const planMemberSchema = z.strictObject({
  user_id: z.uuid(),
  role: planMemberRoleSchema,
  joined_at: utcTimestampSchema,
  display_name: z.string().min(1).max(50).nullable(),
  avatar_url: z.string().max(2048).nullable(),
});

export const planSchema = z.strictObject({
  id: z.uuid(),
  owner_id: z.uuid(),
  activity: safePlanText(PLAN_ACTIVITY_MAX_LENGTH),
  title: safePlanText(PLAN_TITLE_MAX_LENGTH).nullable(),
  starts_at: utcTimestampSchema,
  place_text: safePlanText(PLAN_PLACE_MAX_LENGTH),
  visibility: planVisibilitySchema,
  circle_id: z.uuid().nullable(),
  participant_limit: z.number().int().min(2).max(PLAN_PARTICIPANT_LIMIT_MAX),
  member_count: z.number().int().min(1).max(PLAN_PARTICIPANT_LIMIT_MAX),
  status: planStatusSchema,
  created_at: utcTimestampSchema,
  updated_at: utcTimestampSchema,
  viewer_is_member: z.boolean(),
  viewer_is_owner: z.boolean(),
  source_thread_id: z.uuid().nullable(),
});

export const planCreateResponseSchema = z.strictObject({
  plan: planSchema,
  replayed: z.boolean(),
});
export const planReadResponseSchema = z.strictObject({
  plan: planSchema,
  members: z.array(planMemberSchema).max(PLAN_PARTICIPANT_LIMIT_MAX),
});
export const plansReadResponseSchema = z.strictObject({
  plans: z.array(planSchema).max(100),
});
export const planJoinRequestSchema = z.strictObject({
  share_token: z.string().length(PLAN_SHARE_TOKEN_LENGTH).optional(),
});
export const planJoinResponseSchema = z.strictObject({
  plan: planSchema,
  joined: z.boolean(),
});
export const planLeaveResponseSchema = z.strictObject({
  left: z.literal(true),
});
export const planShareCreateRequestSchema = z
  .strictObject({ expires_at: utcTimestampSchema.optional() })
  .superRefine((value, context) => {
    if (value.expires_at && Date.parse(value.expires_at) <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Share expiry must be in the future",
      });
    }
  });
export const planShareCreateResponseSchema = z.strictObject({
  token: z.string().length(PLAN_SHARE_TOKEN_LENGTH),
  expires_at: utcTimestampSchema.nullable(),
});
export const planShareRevokeResponseSchema = z.strictObject({
  revoked: z.literal(true),
});

export const planMeetupRequestSchema = z.strictObject({
  peerId: z.uuid(),
});

export const planMeetupAcknowledgementSchema = z.strictObject({
  peerId: z.uuid(),
  viewerConfirmed: z.boolean(),
  peerConfirmed: z.boolean(),
  confirmedAt: utcTimestampSchema.nullable(),
});

export const planMeetupStatusResponseSchema = z.strictObject({
  acknowledgements: z.array(planMeetupAcknowledgementSchema).max(PLAN_PARTICIPANT_LIMIT_MAX - 1),
  canConfirm: z.boolean(),
  closesAt: utcTimestampSchema.nullable(),
});

export const publicPlanPreviewSchema = z.strictObject({
  plan: z.strictObject({
    id: z.uuid(),
    activity: safePlanText(PLAN_ACTIVITY_MAX_LENGTH),
    title: safePlanText(PLAN_TITLE_MAX_LENGTH).nullable(),
    starts_at: utcTimestampSchema,
    place_text: safePlanText(PLAN_PLACE_MAX_LENGTH),
    participant_limit: z.number().int().min(2).max(PLAN_PARTICIPANT_LIMIT_MAX),
    member_count: z.number().int().min(1).max(PLAN_PARTICIPANT_LIMIT_MAX),
  }),
  can_join: z.boolean(),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanCreateRequest = z.infer<typeof planCreateRequestSchema>;
export type PlanCreateResponse = z.infer<typeof planCreateResponseSchema>;
export type PlanReadResponse = z.infer<typeof planReadResponseSchema>;
export type PlansReadResponse = z.infer<typeof plansReadResponseSchema>;
export type PlanPatchRequest = z.infer<typeof planPatchRequestSchema>;
export type PlanJoinRequest = z.infer<typeof planJoinRequestSchema>;
export type PlanJoinResponse = z.infer<typeof planJoinResponseSchema>;
export type PlanMeetupRequest = z.infer<typeof planMeetupRequestSchema>;
export type PlanMeetupStatusResponse = z.infer<typeof planMeetupStatusResponseSchema>;
export { idempotencyKeySchema as planIdempotencyKeySchema };
