"use client";

import { ErrorRecovery } from "@/components/ui/error-recovery";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery error={error} reset={reset} />;
}
