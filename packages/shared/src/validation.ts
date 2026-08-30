import { z } from "zod";

export const uuidSchema = z.uuid();

export const coordsSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  provider: z.enum(["expo", "apns"]).optional(),
});

export function isValidUUID(value: string | null | undefined): value is string {
  return !!value && uuidSchema.safeParse(value).success;
}
