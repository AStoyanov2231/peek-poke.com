"use client";

import type { VenueCard } from "@peekpoke/shared/chat-assistance";

export function VenueSuggestionCards({ venues, onSuggestPlace, onMeetHere }: {
  venues: VenueCard[];
  onSuggestPlace: (text: string) => void;
  onMeetHere: (venue: VenueCard) => void;
}) {
  if (!venues.length) return null;
  return <section aria-label="Nearby venue suggestions" className="grid gap-2">
    {venues.map((venue) => <article key={venue.id} className="rounded-md border border-hairline bg-surface p-3">
      <p className="font-semibold text-ink-8">{venue.name}</p>
      {venue.address ? <p className="t-caption text-ink-6">{venue.address}</p> : null}
      <div className="mt-2 flex gap-2"><button type="button" className="btn btn-secondary btn-sm" onClick={() => onSuggestPlace(`How about ${venue.name}?`)}>Suggest place</button><button type="button" className="btn btn-primary btn-sm" onClick={() => onMeetHere(venue)}>Meet here</button></div>
    </article>)}
  </section>;
}
