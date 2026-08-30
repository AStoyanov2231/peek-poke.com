"use client";

import { Loader2, MapPinOff } from "lucide-react";
import { useLocationStatus, useUserLocation } from "@/stores/selectors";

/**
 * Covers the map area until the first location fix.
 */
export function LocationGate({
  pending,
  onRetry,
}: {
  pending: boolean;
  onRetry: () => void;
}) {
  const userLocation = useUserLocation();
  const status = useLocationStatus();

  if (userLocation) return null;

  return (
    <div
      // Fixed so it also covers the browser chrome strip above the page container.
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 px-8 text-center pointer-events-auto"
      style={{ background: "var(--bg)" }}
    >
      {status === "denied" ? (
        <>
          <MapPinOff className="h-10 w-10 text-muted-foreground" />
          <p className="t-title-3 text-ink-9">Location is off</p>
          <p className="text-sm text-muted-foreground">
            Peek &amp; Poke needs your location to show people nearby.
          </p>
          <p className="text-xs text-muted-foreground">
            Allow location access for this site in your browser settings, then reload.
          </p>
        </>
      ) : status === "error" ? (
        <>
          <MapPinOff className="h-10 w-10 text-muted-foreground" />
          <p className="t-title-3 text-ink-9">Could not load your location</p>
          <p className="text-sm text-muted-foreground">Nearby and meeting features remain paused.</p>
          <button
            type="button"
            aria-busy={pending}
            className="min-h-11 min-w-11 rounded-md bg-ink-9 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending}
            onClick={onRetry}
          >
            {pending ? "Retrying…" : "Try again"}
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Finding you…</p>
        </>
      )}
    </div>
  );
}
