import {
  createChatMessagePayload,
  messageMutationResponseSchema,
  type ChatMessageAttempt,
  type ChatMessageDraft,
  type DMMessage,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

type BaseChatMessageInput = {
  threadId: string;
  clientId: string;
  content: string;
  replyToId?: string | null;
};

type TextChatMessageInput = BaseChatMessageInput & {
  messageType?: "text";
};

type ImageChatMessageInput = BaseChatMessageInput & {
  messageType: "image";
  mediaUrl: string;
  mediaThumbnailUrl?: string | null;
};

export type ChatMessageInput = TextChatMessageInput | ImageChatMessageInput;

export function createNativeChatMessagePayload(input: ChatMessageInput) {
  return createChatMessagePayload({
    content: input.content,
    replyToId: input.replyToId,
    ...(input.messageType === "image"
      ? {
          mediaUrl: input.mediaUrl,
          mediaThumbnailUrl: input.mediaThumbnailUrl,
        }
      : {}),
  }, input.clientId);
}

export function sendPreparedChatMessage(
  threadId: string,
  attempt: Pick<ChatMessageAttempt, "clientId" | "payload">,
): Promise<{ message: DMMessage }> {
  return apiFetch<{ message: DMMessage }>(`/api/dm/${encodeURIComponent(threadId)}`, {
    method: "POST",
    headers: { "idempotency-key": attempt.clientId },
    body: jsonBody(attempt.payload),
    responseSchema: messageMutationResponseSchema,
  });
}

export function sendChatMessage(input: ChatMessageInput): Promise<{ message: DMMessage }> {
  const draft: ChatMessageDraft = {
    content: input.content,
    replyToId: input.replyToId,
    ...(input.messageType === "image"
      ? {
          mediaUrl: input.mediaUrl,
          mediaThumbnailUrl: input.mediaThumbnailUrl,
        }
      : {}),
  };
  return sendPreparedChatMessage(input.threadId, {
    clientId: input.clientId,
    payload: createChatMessagePayload(draft, input.clientId),
  });
}
