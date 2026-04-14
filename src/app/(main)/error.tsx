"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
