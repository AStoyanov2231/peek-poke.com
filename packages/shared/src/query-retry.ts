const MAX_SAFE_QUERY_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;
const FALLBACK_RETRY_DELAY_MS = 1_000;

type RetryableTransportFailure = {
  status?: unknown;
  retryAfterMs?: unknown;
};

function transportStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const status = (error as RetryableTransportFailure).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

export function shouldRetrySafeQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_SAFE_QUERY_RETRIES) return false;
  const status = transportStatus(error);
  return status === 0 || (status !== null && status >= 500 && status <= 599);
}

export function safeQueryRetryDelay(attemptIndex: number, error: unknown): number {
  const status = transportStatus(error);
  if (status !== null && status >= 500 && status <= 599 && typeof error === "object" && error !== null) {
    const retryAfterMs = (error as RetryableTransportFailure).retryAfterMs;
    if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
    }
  }

  const safeAttemptIndex = Number.isFinite(attemptIndex)
    ? Math.max(0, Math.floor(attemptIndex))
    : 0;
  return Math.min(FALLBACK_RETRY_DELAY_MS * (2 ** safeAttemptIndex), MAX_RETRY_DELAY_MS);
}
