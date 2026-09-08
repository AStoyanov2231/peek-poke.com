/* eslint-disable import/first -- transport dependency must be mocked before subject import. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch: mocks.apiFetch }));

import {
  fetchChatSuggestions,
  nativeChatSuggestionFallback,
} from "@/data/chat-suggestions";
import { nativeQueryKeys } from "@/data/query-keys";
import { appendEditableChatSuggestion } from "@peekpoke/shared";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";

describe("native chat suggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the authenticated, typed suggestion route with a thread-scoped cache key", async () => {
    const signal = new AbortController().signal;
    const response = {
      source: "deterministic" as const,
      suggestions: [{ id: "time" as const, text: "What time works?" }],
    };
    mocks.apiFetch.mockResolvedValue(response);

    await expect(fetchChatSuggestions(THREAD_ID, signal)).resolves.toEqual(response);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      `/api/dm/${THREAD_ID}/suggestions`,
      expect.objectContaining({ signal, responseSchema: expect.anything() }),
    );
    expect(nativeQueryKeys.chat.suggestions(THREAD_ID)).toEqual([
      "chat",
      THREAD_ID,
      "suggestions",
    ]);
  });

  it("offers only editable, deterministic fallback starters", () => {
    expect(nativeChatSuggestionFallback(false)).toEqual([
      { id: "time", text: "What time would work for you?" },
      { id: "place", text: "Want to choose a general area?" },
    ]);
    expect(nativeChatSuggestionFallback(true)).toEqual([
      { id: "time", text: "Would 20 minutes work for you?" },
      { id: "place", text: "Want to choose a general area?" },
    ]);
  });

  it("appends a suggestion to an unsent draft without sending or replacing it", () => {
    expect(appendEditableChatSuggestion("I can do 6", "Would 20 minutes work?")).toBe(
      "I can do 6 Would 20 minutes work?",
    );
    expect(appendEditableChatSuggestion("I can do 6 ", "Would 20 minutes work?")).toBe(
      "I can do 6 Would 20 minutes work?",
    );
    expect(appendEditableChatSuggestion("", "What time works?")).toBe(
      "What time works?",
    );
    expect(appendEditableChatSuggestion("I am free after six", "How about Juniper Cafe?")).toBe(
      "I am free after six How about Juniper Cafe?",
    );
  });
});
