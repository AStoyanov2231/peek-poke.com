import { z } from "zod";
import { NextResponse } from "next/server";
import { isTemporaryUsername } from "@/lib/auth-profile";
import { apiError } from "@/lib/api-error";
import {
  adminBotCollectRequestSchema,
  friendshipCreateRequestSchema,
  friendshipResponseRequestSchema,
  dmMessageEditRequestSchema,
  meetingRequestSchema,
  ownerProfilePatchRequestSchema,
  resolveTagsRequestSchema,
  userSearchRequestSchema,
} from "@peekpoke/shared";

const uuid = z.uuid();

export const usernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username cannot exceed 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .refine((value) => !isTemporaryUsername(value), "This username is reserved"),
});

export const profileUpdateSchema = ownerProfilePatchRequestSchema;

export const profilePatchSchema = profileUpdateSchema;

export const interestSchema = z.object({
  tag_id: uuid,
});

export const friendRequestSchema = friendshipCreateRequestSchema;

export const meetingSchema = meetingRequestSchema;

export const friendshipUpdateSchema = friendshipResponseRequestSchema;

export { dmThreadCreateRequestSchema as dmThreadCreateSchema } from "@peekpoke/shared";

export const dmMessageEditSchema = dmMessageEditRequestSchema;

export const moderationActionSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(1000, "Reason is too long").optional(),
  })
  .refine(
    (d) => d.action !== "reject" || (d.reason && d.reason.trim().length > 0),
    { message: "Rejection reason is required", path: ["reason"] }
  );

export const profileMediaRemediationSchema = z
  .strictObject({
    operation_id: uuid,
    resolution: z.enum(["reconstruct", "reset"]),
    note: z.string().trim().max(500, "Note is too long").optional(),
  })
  .refine(
    (value) => value.resolution !== "reset" || Boolean(value.note),
    { message: "A reset note is required", path: ["note"] },
  );

export const photoUpdateSchema = z
  .strictObject({
    display_order: z.number().int().min(0).max(100).optional(),
    is_avatar: z.literal(true).optional(),
    is_private: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length === 1, "Provide exactly one photo change");

export const coordsSchema = z.strictObject({
  lat: z.number().min(-90, "lat must be between -90 and 90").max(90, "lat must be between -90 and 90"),
  lng: z.number().min(-180, "lng must be between -180 and 180").max(180, "lng must be between -180 and 180"),
});

export const coinBotCollectSchema = adminBotCollectRequestSchema;

export const userSearchSchema = userSearchRequestSchema;

export const resolveTagsSchema = resolveTagsRequestSchema;

export const userReportSchema = z.strictObject({
  category: z.enum(["spam", "harassment", "explicit_content", "impersonation", "underage", "other"]),
  details: z.string().trim().max(1000, "Details are too long").optional(),
}).strict();

export const reportReviewSchema = z.strictObject({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
}).strict();

export const accountDeleteSchema = z.strictObject({
  confirmation: z.literal("DELETE"),
}).strict();

export const MAX_JSON_BODY_BYTES = 128 * 1024;

async function readBodyWithinLimit(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(parsedLength)) {
      return { error: apiError("Invalid request body", 400, "VALIDATION_ERROR") };
    }
    if (parsedLength > maxBytes) {
      return { error: apiError("Request body too large", 413, "REQUEST_BODY_TOO_LARGE") };
    }
  }

  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { error: apiError("Request body too large", 413, "REQUEST_BODY_TOO_LARGE") };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(body) };
}

/** Parse request JSON with a Zod schema. Returns [data, null] or [null, errorResponse]. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<[T, null] | [null, NextResponse]> {
  const body = await readBodyWithinLimit(request, MAX_JSON_BODY_BYTES);
  if (body.error) return [null, body.error];

  let raw: unknown;
  try {
    raw = body.text ? JSON.parse(body.text) : undefined;
  } catch {
    return [null, apiError("Invalid request body", 400, "VALIDATION_ERROR")];
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0]?.message || "Validation error";
    return [null, apiError(firstError, 400, "VALIDATION_ERROR")];
  }
  return [result.data, null];
}
