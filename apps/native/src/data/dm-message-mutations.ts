import {
  dmMessageEditRequestSchema,
  messageMutationResponseSchema,
  type DmMessageMutationAttempt,
  type MessageMutationResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function mutatePreparedNativeDmMessage(
  attempt: DmMessageMutationAttempt,
): Promise<MessageMutationResponse> {
  const { threadId, messageId } = attempt.scope;
  const headers = { "idempotency-key": attempt.idempotencyKey };
  if (attempt.mutation.kind === "edit") {
    return apiFetch(`/api/dm/${threadId}/${messageId}`, {
      method: "PATCH",
      headers,
      body: jsonBody(dmMessageEditRequestSchema.parse({
        content: attempt.mutation.content,
      })),
      responseSchema: messageMutationResponseSchema,
    });
  }
  return apiFetch(`/api/dm/${threadId}/${messageId}`, {
    method: "DELETE",
    headers,
    responseSchema: messageMutationResponseSchema,
  });
}
