import { z } from "zod";
import {
  pokeCreateRequestSchema,
  pokeResponseRequestSchema,
} from "@peekpoke/shared";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import {
  pokeCreateRpcResultSchema,
  pokeInboxRpcResultSchema,
  pokeResponseRpcResultSchema,
  socialFailure,
  socialRpcFailureSchema,
} from "./contracts";

function parseResult<T>(value: unknown, schema: z.ZodType<T>) {
  const failure = socialRpcFailureSchema.safeParse(value);
  if (failure.success)
    return {
      error: apiError(
        socialFailure(failure.data.error).message,
        socialFailure(failure.data.error).status,
        socialFailure(failure.data.error).code,
      ),
    };
  const parsed = schema.safeParse(value);
  return parsed.success ? { data: parsed.data } : null;
}

export async function readPokes(viewerId: string, limit: number) {
  const { data, error } = await createServiceClient().rpc("get_active_pokes", {
    p_user_id: viewerId,
    p_limit: limit,
  });
  if (error) {
    console.error("pokes read:", error);
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  const result = parseResult(data, pokeInboxRpcResultSchema);
  if (!result) {
    console.error("pokes read: malformed RPC response");
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  return result;
}

export async function createPoke(
  viewerId: string,
  body: unknown,
  idempotencyKey: string,
) {
  const request = pokeCreateRequestSchema.safeParse(body);
  if (!request.success)
    return { error: apiError("Invalid poke", 400, "VALIDATION_ERROR") };
  const { data, error } = await createServiceClient().rpc("create_poke", {
    p_sender_id: viewerId,
    p_recipient_id: request.data.recipientId,
    p_activity: request.data.activity,
    p_custom_label: request.data.customLabel,
    p_note: request.data.note,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.error("poke create:", error);
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  const result = parseResult(data, pokeCreateRpcResultSchema);
  if (!result) {
    console.error("poke create: malformed RPC response");
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  if ("error" in result) return result;
  if (result.data.poke.senderId !== viewerId) {
    console.error("poke create: RPC sender mismatch");
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  return result;
}

export async function respondToPoke(
  viewerId: string,
  pokeId: string,
  body: unknown,
  idempotencyKey: string,
) {
  const request = pokeResponseRequestSchema.safeParse(body);
  if (!request.success)
    return {
      error: apiError("Invalid poke response", 400, "VALIDATION_ERROR"),
    };
  const { data, error } = await createServiceClient().rpc("respond_to_poke", {
    p_recipient_id: viewerId,
    p_poke_id: pokeId,
    p_action: request.data.action,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.error("poke response:", error);
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  const result = parseResult(data, pokeResponseRpcResultSchema);
  if (!result) {
    console.error("poke response: malformed RPC response");
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  if ("error" in result) return result;
  if (result.data.poke.recipientId !== viewerId) {
    console.error("poke response: RPC recipient mismatch");
    return {
      error: apiError(
        "Pokes are temporarily unavailable",
        503,
        "POKES_UNAVAILABLE",
      ),
    };
  }
  return result;
}
