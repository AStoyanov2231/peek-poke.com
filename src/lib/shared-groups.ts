import { mapMessage } from "@/lib/api-contract";
import type { Message } from "@peekpoke/shared";

export function mapSharedGroupMessage(
  value: unknown,
  groupId: string,
  lastReadSequence?: number,
): Message {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
  const message = mapMessage({
    ...row,
    thread_id: groupId,
    reply_to_id: null,
    reply_to: null,
    sender,
  });
  return {
    ...message,
    is_read: lastReadSequence === undefined || typeof message.sequence !== "number"
      ? message.is_read
      : message.sequence <= lastReadSequence,
  };
}
