export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_MAX_DELAY_MS = 60 * 60 * 1000;

export type RetryDecision = {
  dead: boolean;
  availableAt: Date;
};

export function outboxRetryDecision(
  attempts: number,
  now = new Date(),
  random = Math.random,
): RetryDecision {
  const normalizedAttempts = Math.max(1, Math.trunc(attempts));
  const dead = normalizedAttempts >= OUTBOX_MAX_ATTEMPTS;
  if (dead) return { dead: true, availableAt: now };

  const baseDelay = Math.min(
    OUTBOX_MAX_DELAY_MS,
    1_000 * 2 ** (normalizedAttempts - 1),
  );
  const jitter = Math.floor(baseDelay * 0.2 * Math.max(0, Math.min(1, random())));
  return {
    dead: false,
    availableAt: new Date(now.getTime() + baseDelay + jitter),
  };
}

export function resumableOutboxRetryDecision(
  attempts: number,
  now = new Date(),
  random = Math.random,
): RetryDecision {
  const normalizedAttempts = Math.max(1, Math.trunc(attempts));
  const baseDelay = Math.min(
    OUTBOX_MAX_DELAY_MS,
    1_000 * 2 ** Math.min(normalizedAttempts - 1, 30),
  );
  const jitter = Math.floor(baseDelay * 0.2 * Math.max(0, Math.min(1, random())));
  return {
    dead: false,
    availableAt: new Date(now.getTime() + baseDelay + jitter),
  };
}

const SQLSTATE_CODE = /^[0-9A-Z]{5}$/;
const POSTGREST_CODE = /^PGRST[0-9]{3}$/;

function safeProviderError(error: unknown): string | null {
  if (typeof error !== "object" || error === null || error instanceof Error)
    return null;

  try {
    const candidate = error as { code?: unknown; status?: unknown };
    const code = candidate.code;
    const status = candidate.status;
    const parts: string[] = [];

    if (
      typeof code === "string" &&
      (SQLSTATE_CODE.test(code) || POSTGREST_CODE.test(code))
    )
      parts.push(`code ${code}`);
    if (
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    )
      parts.push(`HTTP status ${status}`);

    return parts.length > 0 ? `Provider error: ${parts.join(", ")}` : null;
  } catch {
    return null;
  }
}

export function safeOutboxError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : safeProviderError(error) ?? "Unknown worker error";
  return message.replace(/[\r\n]+/g, " ").slice(0, 1000);
}
