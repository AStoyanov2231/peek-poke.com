import { z } from "zod";
import { profileCardSchema, utcTimestampSchema } from "./contract";
import { planSchema } from "./plans";

export const activitySchema = z.enum([
  "coffee",
  "food",
  "walk",
  "gym",
  "study",
  "drinks",
  "gaming",
  "explore",
  "anything",
  "custom",
]);

const customActivityFields = {
  activity: activitySchema,
  customLabel: z.string().trim().min(1).max(48).nullable(),
};

function requireCustomLabel<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, context) => {
    const activity = (value as { activity: z.infer<typeof activitySchema> })
      .activity;
    const customLabel = (value as { customLabel: string | null }).customLabel;
    if (activity === "custom" && customLabel === null) {
      context.addIssue({
        code: "custom",
        path: ["customLabel"],
        message: "Custom activities need a label",
      });
    }
    if (activity !== "custom" && customLabel !== null) {
      context.addIssue({
        code: "custom",
        path: ["customLabel"],
        message: "Only custom activities may have a label",
      });
    }
  });
}

export const availabilitySchema = requireCustomLabel(
  z.strictObject({
    id: z.uuid(),
    userId: z.uuid(),
    ...customActivityFields,
    expiresAt: utcTimestampSchema,
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
  }),
);

export const availabilityUpsertRequestSchema = requireCustomLabel(
  z.strictObject({
    ...customActivityFields,
    durationMinutes: z.number().int().min(15).max(720),
  }),
);

export const availabilityResponseSchema = z.strictObject({
  availability: availabilitySchema.nullable(),
});

export const availablePersonSchema = z.strictObject({
  profile: profileCardSchema,
  availability: availabilitySchema,
  // This is a server-computed 2 km distance bucket from snapped cells, never a coordinate-derived precise distance.
  distanceKm: z.number().finite().nonnegative().max(26).multipleOf(2),
  relationship: z.enum(["friend", "none"]),
  sharedInterestNames: z.array(z.string().trim().min(1).max(64)).max(20),
  discoveryReasons: z.array(z.enum([
    "intent_match",
    "nearby_friend",
    "shared_interests",
    "mutual_friends",
    "connected_before",
    "mutual_meetup",
  ])).max(3).optional(),
});

export const availabilityReadResponseSchema = z.strictObject({
  availability: availabilitySchema.nullable(),
  people: z.array(availablePersonSchema).max(100),
});

export const profileSocialContextResponseSchema = z.strictObject({
  availability: availabilitySchema.nullable(),
  sharedCircles: z.array(z.strictObject({
    id: z.uuid(),
    name: z.literal("Shared group"),
  })).max(6),
  upcomingPlans: z.array(planSchema).max(3),
  mutualMeetups: z.number().int().nonnegative().max(100_000),
});

export const pokeStatusSchema = z.enum([
  "pending",
  "accepted",
  "later",
  "declined",
  "expired",
]);

export const pokeSchema = requireCustomLabel(
  z.strictObject({
    id: z.uuid(),
    senderId: z.uuid(),
    recipientId: z.uuid(),
    ...customActivityFields,
    note: z.string().trim().min(1).max(280).nullable(),
    status: pokeStatusSchema,
    expiresAt: utcTimestampSchema,
    createdAt: utcTimestampSchema,
    respondedAt: utcTimestampSchema.nullable(),
    threadId: z.uuid().nullable(),
  }),
);

/** Profiles are attached only to inbox reads after the server's block gate. */
export const pokeInboxItemSchema = pokeSchema
  .extend({
    sender: profileCardSchema.optional(),
    recipient: profileCardSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.sender && !value.recipient) {
      context.addIssue({
        code: "custom",
        message: "A Poke inbox item needs its peer profile",
      });
    }
  });

export const pokeCreateRequestSchema = requireCustomLabel(
  z.strictObject({
    recipientId: z.uuid(),
    ...customActivityFields,
    note: z.string().trim().min(1).max(280).nullable().optional(),
  }),
).transform((value) => ({ ...value, note: value.note ?? null }));

export const pokeInboxResponseSchema = z.strictObject({
  received: z.array(pokeInboxItemSchema).max(100),
  sent: z.array(pokeInboxItemSchema).max(100),
});

export const pokeCreateResponseSchema = z.strictObject({
  poke: pokeSchema,
  replayed: z.boolean(),
});

export const pokeResponseRequestSchema = z.strictObject({
  action: z.enum(["accept", "later", "decline"]),
});

export const pokeResponseSchema = z
  .strictObject({
    poke: pokeSchema,
    threadId: z.uuid().optional(),
    replayed: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.poke.status === "accepted" &&
      value.threadId !== value.poke.threadId
    ) {
      context.addIssue({
        code: "custom",
        path: ["threadId"],
        message: "Accepted pokes must return their thread",
      });
    }
    if (value.poke.status !== "accepted" && value.threadId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["threadId"],
        message: "Only accepted pokes may return a thread",
      });
    }
  });

export type Activity = z.infer<typeof activitySchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type AvailablePerson = z.infer<typeof availablePersonSchema>;
export type Poke = z.infer<typeof pokeSchema>;
export type PokeInboxItem = z.infer<typeof pokeInboxItemSchema>;
export type AvailabilityUpsertRequest = z.infer<
  typeof availabilityUpsertRequestSchema
>;
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
export type AvailabilityReadResponse = z.infer<
  typeof availabilityReadResponseSchema
>;
export type ProfileSocialContextResponse = z.infer<typeof profileSocialContextResponseSchema>;
export type PokeCreateRequest = z.infer<typeof pokeCreateRequestSchema>;
export type PokeInboxResponse = z.infer<typeof pokeInboxResponseSchema>;
export type PokeResponseRequest = z.infer<typeof pokeResponseRequestSchema>;
export type PokeResponse = z.infer<typeof pokeResponseSchema>;

/** Client display fence for cached availability. Server expiry remains authoritative. */
export function isAvailabilityCurrent(
  availability: Availability | null,
  nowMs = Date.now(),
): availability is Availability {
  return availability !== null && Date.parse(availability.expiresAt) > nowMs;
}
