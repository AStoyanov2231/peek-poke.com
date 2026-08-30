import { createHash } from "node:crypto";
import { dmMessageEditRequestSchema } from "@peekpoke/shared";

export const DM_MESSAGE_EDIT_OPERATION = "dm_message:edit";
export const DM_MESSAGE_DELETE_OPERATION = "dm_message:delete";

export function dmMessageEditHash(
  actorId: string,
  threadId: string,
  messageId: string,
  value: unknown,
) {
  const body = dmMessageEditRequestSchema.parse(value);
  return createHash("sha256").update(JSON.stringify({
    actor_id: actorId,
    operation: DM_MESSAGE_EDIT_OPERATION,
    thread_id: threadId,
    message_id: messageId,
    body,
  })).digest("hex");
}

export function dmMessageDeleteHash(
  actorId: string,
  threadId: string,
  messageId: string,
) {
  return createHash("sha256").update(JSON.stringify({
    actor_id: actorId,
    operation: DM_MESSAGE_DELETE_OPERATION,
    thread_id: threadId,
    message_id: messageId,
  })).digest("hex");
}
