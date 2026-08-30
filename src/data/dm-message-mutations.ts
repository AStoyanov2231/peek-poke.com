import {
  dmMessageEditRequestSchema,
  messageMutationResponseSchema,
  type DmMessageMutationAttempt,
  type MessageMutationResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function mutatePreparedWebDmMessage(
  attempt: DmMessageMutationAttempt,
): Promise<MessageMutationResponse> {
  const { threadId, messageId } = attempt.scope;
  const headers = new Headers({ "idempotency-key": attempt.idempotencyKey });
  if (attempt.mutation.kind === "edit") {
    headers.set("content-type", "application/json");
    return fetchContract(
      `/api/dm/${threadId}/${messageId}`,
      messageMutationResponseSchema,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(dmMessageEditRequestSchema.parse({
          content: attempt.mutation.content,
        })),
      },
    );
  }
  return fetchContract(
    `/api/dm/${threadId}/${messageId}`,
    messageMutationResponseSchema,
    { method: "DELETE", headers },
  );
}
