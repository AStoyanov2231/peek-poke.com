"use client";

import { CalendarPlus, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchContract } from "@/lib/typed-api";
import { chatSuggestionsResponseSchema } from "@peekpoke/shared/chat-suggestions";
import { venueSuggestionsResponseSchema, type VenueCard } from "@peekpoke/shared/chat-assistance";
import { VenueSuggestionCards } from "./VenueSuggestionCards";

type ChatMomentumActionsProps = {
  threadId: string;
  threadReady: boolean;
  hasMessages: boolean;
  onChooseReply: (reply: string) => void;
  onMakePlan: () => void;
  onMeetHere: (venue: VenueCard) => void;
};

/** Suggestions come from an authenticated, deterministic endpoint. Selecting
 * one only puts editable text in the composer and never sends on a member's behalf. */
export function ChatMomentumActions({
  threadId,
  threadReady,
  hasMessages,
  onChooseReply,
  onMakePlan,
  onMeetHere,
}: ChatMomentumActionsProps) {
  const fallback = useMemo(
    () =>
      hasMessages
        ? [
            { id: "time" as const, text: "Would 20 minutes work for you?" },
            { id: "place" as const, text: "Want to choose a general area?" },
          ]
        : [
            { id: "time" as const, text: "What time would work for you?" },
            { id: "place" as const, text: "Want to choose a general area?" },
          ],
    [hasMessages],
  );
  const suggestionQuery = useQuery({
    queryKey: ["web", "chat-suggestions", threadId],
    queryFn: ({ signal }) => fetchContract(`/api/dm/${threadId}/suggestions`, chatSuggestionsResponseSchema, { signal, cache: "no-store" }),
    enabled: threadReady,
    staleTime: 30_000,
  });
  const venueQuery = useQuery({
    queryKey: ["web", "chat-venues", threadId],
    queryFn: ({ signal }) => fetchContract(`/api/dm/${threadId}/venues`, venueSuggestionsResponseSchema, { signal, cache: "no-store" }),
    enabled: threadReady,
    staleTime: 30_000,
  });
  const suggestions = suggestionQuery.data?.suggestions ?? fallback;
  const venues = venueQuery.data?.venues ?? [];
  const venuesUnavailable = venueQuery.isError || venueQuery.data?.source === "unavailable";
  if (!threadReady) return null;

  return (
    <div className="border-t border-hairline bg-surface px-4 py-3">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 t-caption text-ink-6">
          <Sparkles size={13} aria-hidden="true" />
          Move it forward
        </span>
        {suggestions
          .filter((suggestion) => suggestion.id !== "plan")
          .map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className="rounded-pill border border-hairline bg-background px-3 py-1.5 text-left t-caption text-ink-7 transition-colors hover:bg-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChooseReply(suggestion.text)}
            >
              {suggestion.text}
            </button>
          ))}
        <button
          type="button"
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-primary-100 px-3 t-caption font-semibold text-primary-700 transition-colors hover:bg-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onMakePlan}
        >
          <CalendarPlus size={14} aria-hidden="true" />
          {suggestions.find((suggestion) => suggestion.id === "plan")?.text ??
            "Make a plan"}
        </button>
      </div>
      <div className="mx-auto mt-2 w-full max-w-xl"><VenueSuggestionCards venues={venues} onSuggestPlace={onChooseReply} onMeetHere={onMeetHere} />{venuesUnavailable && !venues.length ? <p className="t-caption text-ink-6">Venue suggestions are unavailable right now.</p> : null}</div>
    </div>
  );
}
