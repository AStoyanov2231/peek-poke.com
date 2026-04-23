"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 bg-ink-1">
      <div className="card-flat rounded-lg p-6 flex flex-col items-center gap-3 max-w-sm w-full text-center">
        <h2 className="t-title-2 text-ink-9">Something went wrong</h2>
        <p className="t-body muted">
          {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
        </p>
        <button onClick={reset} className="btn btn-secondary btn-md mt-1">
          Try again
        </button>
      </div>
    </div>
  );
}
