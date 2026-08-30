"use client";

type RecoverableError = Error & { digest?: string };

export function ErrorRecovery({
  error,
  reset,
  title = "Something went wrong",
  fillViewport = false,
}: {
  error: RecoverableError;
  reset: () => void;
  title?: string;
  fillViewport?: boolean;
}) {
  return (
    <main
      className={`flex flex-col items-center justify-center gap-4 p-4 bg-ink-1 ${fillViewport ? "min-h-screen" : "h-full"}`}
    >
      <div aria-live="assertive" className="card-flat rounded-lg p-6 flex flex-col items-center gap-3 max-w-sm w-full text-center" role="alert">
        <h2 className="t-title-2 text-ink-9">{title}</h2>
        <p className="t-body muted">
          {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
        </p>
        <button type="button" onClick={reset} className="btn btn-secondary btn-md mt-1">
          Try again
        </button>
      </div>
    </main>
  );
}
