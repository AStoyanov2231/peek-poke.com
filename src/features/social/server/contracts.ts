import { z } from "zod";
import {
  availabilityReadResponseSchema,
  availabilityResponseSchema,
  pokeCreateResponseSchema,
  pokeInboxResponseSchema,
  pokeResponseSchema,
} from "@peekpoke/shared";

export const availabilityRpcResultSchema = availabilityResponseSchema;
export const availabilityReadRpcResultSchema = availabilityReadResponseSchema;
export const pokeCreateRpcResultSchema = pokeCreateResponseSchema;
export const pokeInboxRpcResultSchema = pokeInboxResponseSchema;
export const pokeResponseRpcResultSchema = pokeResponseSchema;

export const socialRpcFailureSchema = z.strictObject({
  error: z.enum([
    "SELF_TARGET",
    "USER_NOT_FOUND",
    "BLOCKED",
    "POKE_NOT_FOUND",
    "POKE_EXPIRED",
    "POKE_ALREADY_RESPONDED",
    "IDEMPOTENCY_KEY_REUSED",
  ]),
  replayed: z.boolean().optional(),
});

export function socialFailure(
  error: z.infer<typeof socialRpcFailureSchema>["error"],
) {
  switch (error) {
    case "SELF_TARGET":
      return {
        status: 400,
        message: "You cannot poke yourself",
        code: "POKE_SELF_TARGET",
      };
    case "IDEMPOTENCY_KEY_REUSED":
      return {
        status: 409,
        message: "Idempotency key was already used for a different request",
        code: error,
      };
    case "POKE_EXPIRED":
      return { status: 410, message: "This poke has expired", code: error };
    case "POKE_ALREADY_RESPONDED":
      return {
        status: 409,
        message: "This poke has already been answered",
        code: error,
      };
    case "USER_NOT_FOUND":
    case "BLOCKED":
    case "POKE_NOT_FOUND":
      return {
        status: 404,
        message: "Not found",
        code: error === "POKE_NOT_FOUND" ? error : "USER_NOT_FOUND",
      };
  }
}
