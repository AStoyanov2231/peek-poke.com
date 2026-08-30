import { z } from "zod";

export const MAX_ADMIN_BOTS = 50;
export const MAX_COIN_BALANCE = 5;

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

const queryNumberSchema = z
  .string()
  .refine((value) => value.trim().length > 0 && Number.isFinite(Number(value)))
  .transform((value) => Number(value));

export const adminBotCoordinatesSchema = z.strictObject({
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const adminBotListQuerySchema = z.strictObject({
  lat: queryNumberSchema.pipe(latitudeSchema),
  lng: queryNumberSchema.pipe(longitudeSchema),
});

export function normalizeAdminBotListQuery(value: unknown): unknown {
  if (typeof URLSearchParams === "undefined" || !(value instanceof URLSearchParams)) return value;
  const normalized: Record<string, string> = {};
  for (const [key, entryValue] of value.entries()) {
    if (Object.hasOwn(normalized, key)) {
      return { ...normalized, __duplicate_query_parameter__: key };
    }
    normalized[key] = entryValue;
  }
  return normalized;
}

export const adminBotSchema = z.strictObject({
  id: z.uuid(),
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const adminBotListResponseSchema = z
  .array(adminBotSchema)
  .max(MAX_ADMIN_BOTS)
  .superRefine((bots, context) => {
    const ids = new Set<string>();
    for (const [index, bot] of bots.entries()) {
      if (ids.has(bot.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Duplicate bot",
        });
      }
      ids.add(bot.id);
    }
  });

export const adminBotCollectRequestSchema = adminBotCoordinatesSchema.extend({
  id: z.uuid(),
}).strict();

const coinBalanceSchema = z.number().int().min(0).max(MAX_COIN_BALANCE);

export const adminBotCollectResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), balance: coinBalanceSchema }),
  z.strictObject({ ok: z.literal(false), reason: z.enum([
    "invalid_request",
    "location_stale",
    "wallet_not_found",
    "not_found",
    "too_far",
  ]) }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.literal("at_capacity"),
    balance: coinBalanceSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.literal("already_collected"),
    balance: coinBalanceSchema,
  }),
]);

export type AdminBot = z.infer<typeof adminBotSchema>;
export type AdminBotCollectRequest = z.infer<typeof adminBotCollectRequestSchema>;
export type AdminBotCollectResult = z.infer<typeof adminBotCollectResultSchema>;

export function adminBotCollectionWasApplied(result: AdminBotCollectResult) {
  return result.ok || result.reason === "already_collected";
}

export function adminBotCollectionCommitPlan(result: AdminBotCollectResult) {
  if (result.ok) {
    return { balance: result.balance, removeBot: true, refreshBots: true } as const;
  }
  if (result.reason === "already_collected") {
    return { balance: result.balance, removeBot: true, refreshBots: true } as const;
  }
  if (result.reason === "at_capacity") {
    return { balance: result.balance, removeBot: false, refreshBots: false } as const;
  }
  return { balance: null, removeBot: false, refreshBots: false } as const;
}
