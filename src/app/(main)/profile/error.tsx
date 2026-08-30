"use client";

import { ErrorRecovery } from "@/components/ui/error-recovery";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery error={error} reset={reset} title="Couldn't load profile" />;
}
