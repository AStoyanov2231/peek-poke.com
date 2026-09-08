import {
  chatSuggestionsResponseSchema,
  type ChatSuggestionsResponse,
} from "@peekpoke/shared";
import { apiFetch } from "@/lib/api";

export function fetchChatSuggestions(
  threadId: string,
  signal?: AbortSignal,
): Promise<ChatSuggestionsResponse> {
  return apiFetch<ChatSuggestionsResponse>(
    `/api/dm/${encodeURIComponent(threadId)}/suggestions`,
    { signal, responseSchema: chatSuggestionsResponseSchema },
  );
}

export function nativeChatSuggestionFallback(
  hasMessages: boolean,
): ChatSuggestionsResponse["suggestions"] {
  return hasMessages
    ? [
        { id: "time", text: "Would 20 minutes work for you?" },
        { id: "place", text: "Want to choose a general area?" },
      ]
    : [
        { id: "time", text: "What time would work for you?" },
        { id: "place", text: "Want to choose a general area?" },
      ];
}
