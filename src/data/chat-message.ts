import {
  messageMutationResponseSchema,
  type ChatMessageAttempt,
  type MessageMutationResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function sendPreparedWebChatMessage(
  threadId: string,
  attempt: Pick<ChatMessageAttempt, "clientId" | "payload">,
): Promise<MessageMutationResponse> {
  return fetchContract(`/api/dm/${encodeURIComponent(threadId)}`, messageMutationResponseSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": attempt.clientId,
    },
    body: JSON.stringify(attempt.payload),
  });
}
