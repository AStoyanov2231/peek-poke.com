import { z } from "zod";
import { NextResponse } from "next/server";
import { isValidMediaUrl } from "@/lib/validation";

const uuid = z.string().uuid();

export const usernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username cannot exceed 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

export const profileUpdateSchema = z
  .object({
    display_name: z.string().max(50, "Display name must be 50 characters or less").optional(),
    bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
    location_text: z.string().max(100, "Location must be 100 characters or less").optional(),
    avatar_url: z.string().max(2048, "URL too long").refine((v) => isValidMediaUrl(v), "Invalid avatar URL").optional(),
  })
  .strict();

export const interestSchema = z.object({
  tag_id: uuid,
});

export const friendRequestSchema = z.object({
  addressee_id: uuid,
});

export const friendshipUpdateSchema = z.object({
  status: z.enum(["accepted", "declined"]),
});

export const dmThreadCreateSchema = z.object({
  user_id: uuid,
});

export const dmMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Content is required")
    .max(4000, "Content too long")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "Content is required"),
  message_type: z.enum(["text", "image"]).default("text"),
  media_url: z.string().max(2048, "URL too long").refine((v) => isValidMediaUrl(v), "Invalid media URL").optional(),
  media_thumbnail_url: z.string().max(2048, "URL too long").refine((v) => isValidMediaUrl(v), "Invalid thumbnail URL").optional(),
});

export const dmMessageEditSchema = z.object({
  content: z
    .string()
    .min(1, "Content is required")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "Content is required"),
});

export const moderationActionSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().optional(),
  })
  .refine(
    (d) => d.action !== "reject" || (d.reason && d.reason.trim().length > 0),
    { message: "Rejection reason is required", path: ["reason"] }
  );

export const photoUpdateSchema = z.object({
  display_order: z.number().int().optional(),
  is_avatar: z.boolean().optional(),
  is_private: z.boolean().optional(),
});

/** Parse request JSON with a Zod schema. Returns [data, null] or [null, errorResponse]. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<[T, null] | [null, NextResponse]> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return [null, NextResponse.json({ error: "Invalid request body" }, { status: 400 })];
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0]?.message || "Validation error";
    return [null, NextResponse.json({ error: firstError }, { status: 400 })];
  }
  return [result.data, null];
}
