import { z } from "zod";

export const chatSuggestionSchema = z.strictObject({
  id: z.enum(["time", "place", "plan"]),
  text: z.string().min(1).max(120),
});
export const chatSuggestionsResponseSchema = z.strictObject({
  source: z.literal("deterministic"),
  suggestions: z.array(chatSuggestionSchema).min(1).max(3),
});
export type ChatSuggestionsResponse = z.infer<
  typeof chatSuggestionsResponseSchema
>;
