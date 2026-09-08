import { z } from "zod";

export const chatSuggestionSchema = z.strictObject({
  id: z.enum(["time", "place", "plan"]),
  text: z.string().min(1).max(120),
});
export const chatSuggestionSourceSchema = z.enum(["deterministic", "openai"]);
export const chatSuggestionsResponseSchema = z.strictObject({
  source: chatSuggestionSourceSchema,
  suggestions: z.array(chatSuggestionSchema).min(1).max(3),
});
export type ChatSuggestionsResponse = z.infer<
  typeof chatSuggestionsResponseSchema
>;

/** Adds a suggestion to a live draft without replacing an unsent message. */
export function appendEditableChatSuggestion(draft: string, suggestion: string) {
  const next = suggestion.trim();
  if (!next) return draft;
  if (!draft.trim()) return next;
  return `${draft}${/\s$/.test(draft) ? "" : " "}${next}`;
}
