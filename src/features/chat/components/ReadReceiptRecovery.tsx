interface ReadReceiptRecoveryProps {
  pending: boolean;
  onRetry: () => void;
}

export function ReadReceiptRecovery({ pending, onRetry }: ReadReceiptRecoveryProps) {
  return (
    <div
      aria-live="assertive"
      className="flex items-center justify-between gap-3 border-b border-hairline bg-danger-50 px-4 py-2 text-sm text-danger-700"
      role="alert"
    >
      <span>Unread status could not sync.</span>
      <button
        aria-busy={pending}
        aria-label="Retry unread status sync"
        className="min-h-11 font-semibold"
        disabled={pending}
        onClick={onRetry}
        type="button"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
