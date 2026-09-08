import { conversationAccessFromFacts, conversationWindowRemainingMs, utcTimestampSchema, type DmConversationAccess } from "@peekpoke/shared";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

const factsSchema = z.strictObject({
  friendship_accepted: z.boolean(),
  latest_poke_accepted_at: utcTimestampSchema.nullable(),
  server_now: utcTimestampSchema,
});

export async function readDmConversationAccess(threadId: string, accountId: string) {
  const { data, error } = await createServiceClient().rpc("read_dm_conversation_facts_v1", {
    p_actor_id: accountId,
    p_thread_id: threadId,
  });
  if (error?.code === "42501") return { data: null, error: apiError("Conversation unavailable", 404, "THREAD_NOT_FOUND") };
  const parsed = factsSchema.safeParse(data);
  if (error || !parsed.success) return { data: null, error: apiError("Conversation access is temporarily unavailable", 503, "CONVERSATION_ACCESS_UNAVAILABLE") };
  return {
    data: conversationAccessFromFacts({
      threadId,
      accountId,
      friendshipAccepted: parsed.data.friendship_accepted,
      latestPokeAcceptedAt: parsed.data.latest_poke_accepted_at,
      serverNow: parsed.data.server_now,
    }),
    error: null,
  };
}

export function conversationExpiredResponse() {
  return apiError("This Poke conversation has ended. Send a new Poke to reconnect.", 409, "POKE_CONVERSATION_EXPIRED");
}

export function isConversationExpiryError(error: { code?: string; message?: string } | null) {
  return error?.code === "PT409" && error.message?.includes("POKE_CONVERSATION_EXPIRED") === true;
}

export function isConversationExpired(access: DmConversationAccess) {
  return conversationWindowRemainingMs(access, 0) === 0;
}

export async function requireNewDmInteraction(threadId: string, accountId: string) {
  const result = await readDmConversationAccess(threadId, accountId);
  if (result.error) return result.error;
  return isConversationExpired(result.data) ? conversationExpiredResponse() : null;
}
