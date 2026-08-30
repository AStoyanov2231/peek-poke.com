"use client";

import { ErrorRecovery } from "@/components/ui/error-recovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery error={error} fillViewport reset={reset} />;
}
