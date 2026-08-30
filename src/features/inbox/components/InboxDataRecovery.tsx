interface InboxDataRecoveryProps {
  pending: boolean;
  onRetry: () => void;
}

export function InboxDataRecovery({ pending, onRetry }: InboxDataRecoveryProps) {
  return (
    <div
      aria-live="assertive"
      className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
      role="alert"
    >
      <span>Showing your previous inbox. Unread status may be outdated.</span>
      <button
        aria-busy={pending}
        aria-label="Retry inbox sync"
        className="min-h-11 shrink-0 font-semibold"
        disabled={pending}
        onClick={onRetry}
        type="button"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
