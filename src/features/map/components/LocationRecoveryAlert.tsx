"use client";

export function LocationRecoveryAlert({
  open,
  pending,
  onRetry,
}: {
  open: boolean;
  pending: boolean;
  onRetry: () => void;
}) {
  if (!open) return null;

  return (
    <div
      aria-live="assertive"
      role="alert"
      className="pointer-events-auto fixed bottom-6 left-1/2 z-[65] flex -translate-x-1/2 items-center gap-3 rounded-md bg-ink-9 px-4 py-3 text-sm font-semibold text-white shadow-e-2"
      data-testid="location-recovery-alert"
    >
      <span>Your location is stale. Nearby and meeting features are paused.</span>
      <button
        type="button"
        aria-busy={pending}
        aria-label="Retry location recovery"
        className="min-h-11 min-w-11 rounded-sm bg-white px-3 py-1.5 text-ink-9 disabled:opacity-60"
        disabled={pending}
        onClick={onRetry}
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
