import { describe, expect, it } from "vitest";
import { appendEditableChatSuggestion } from "@peekpoke/shared/chat-suggestions";

describe("chat suggestion draft insertion", () => {
  it("uses the same non-destructive insertion policy for web and native composers", () => {
    expect(appendEditableChatSuggestion("I can meet after work", "Want to pick a public spot?")).toBe(
      "I can meet after work Want to pick a public spot?",
    );
    expect(appendEditableChatSuggestion("Draft with a newline\n", "What time works?")).toBe(
      "Draft with a newline\nWhat time works?",
    );
    expect(appendEditableChatSuggestion("I am free after six", "How about Juniper Cafe?")).toBe(
      "I am free after six How about Juniper Cafe?",
    );
  });
});
