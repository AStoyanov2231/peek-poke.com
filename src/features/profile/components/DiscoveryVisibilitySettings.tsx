"use client";

import { useState } from "react";

export type DiscoveryAudience = "hidden" | "friends" | "friends_of_friends" | "circles" | "everyone";

const options: Array<{ value: DiscoveryAudience; label: string; detail: string }> = [
  { value: "hidden", label: "Hidden", detail: "Nobody can discover your location or availability." },
  { value: "friends", label: "Friends", detail: "Only people you are friends with can discover them." },
  { value: "friends_of_friends", label: "Friends of friends", detail: "Friends and their friends can discover them." },
  { value: "circles", label: "Your Circles", detail: "People in your shared Circles can discover them." },
  { value: "everyone", label: "Everyone", detail: "People using Peek & Poke nearby can discover them." },
];

export function DiscoveryVisibilitySettings({ audience, onSave }: { audience: DiscoveryAudience; onSave: (audience: DiscoveryAudience) => Promise<void> }) {
  const [draft, setDraft] = useState(() => ({ audience, selected: audience, isDirty: false }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (draft.audience !== audience) {
    const preserveUnsavedSelection = draft.isDirty && draft.selected !== audience;
    setDraft({
      audience,
      selected: preserveUnsavedSelection ? draft.selected : audience,
      isDirty: preserveUnsavedSelection,
    });
  }

  const selected = draft.selected;

  const save = async () => {
    setPending(true); setError(null);
    try { await onSave(selected); } catch { setError("Couldn’t save visibility. Please try again."); } finally { setPending(false); }
  };
  return <section className="space-y-3" aria-labelledby="discovery-visibility-title">
    <div><h3 id="discovery-visibility-title" className="text-base font-semibold text-foreground">Discovery visibility</h3><p className="mt-1 text-sm text-muted-foreground">Choose who can discover your approximate location and current availability. Your precise location is never shown.</p></div>
    <div role="radiogroup" aria-label="Discovery visibility" className="space-y-2">{options.map((option) => <label key={option.value} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"><input type="radio" name="discovery-audience" value={option.value} checked={selected === option.value} onChange={() => { setDraft({ audience, selected: option.value, isDirty: option.value !== audience }); setError(null); }} disabled={pending}/><span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.detail}</span></span></label>)}</div>
    {error ? <p role="alert" className="text-sm text-danger-500">{error}</p> : null}
    <button type="button" className="btn btn-accent btn-md" disabled={pending || selected === audience} onClick={() => void save()}>{pending ? "Saving…" : error ? "Retry save" : "Save visibility"}</button>
  </section>;
}
