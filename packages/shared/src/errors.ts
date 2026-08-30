import { API_VERSION } from "./contract";
import { z } from "zod";

export const API_ERROR_CODES = {
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  invalidRequest: "INVALID_REQUEST",
  invalidPagination: "INVALID_PAGINATION",
  invalidIdempotencyKey: "INVALID_IDEMPOTENCY_KEY",
  messageMediaAlreadyClaimed: "MESSAGE_MEDIA_ALREADY_CLAIMED",
  internal: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES] | string;

export type ApiErrorEnvelope = {
  version: typeof API_VERSION;
  error: string;
  message: string;
  code: ApiErrorCode;
  request_id: string | null;
};

const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

export function parseRequestId(value: string | null): string | null {
  const result = requestIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

export const apiErrorEnvelopeSchema = z.strictObject({
  version: z.literal(API_VERSION),
  error: z.string().min(1),
  message: z.string().min(1),
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  request_id: requestIdSchema.nullable(),
});

export type ApiTransportFailure = {
  message: string;
  status: number;
  code: ApiErrorCode;
  requestId: string | null;
  retryAfterMs: number | null;
};

export function invalidResponseFailure(requestId: string | null): ApiTransportFailure {
  return {
    message: "Invalid server response",
    status: 502,
    code: "INVALID_RESPONSE",
    requestId,
    retryAfterMs: null,
  };
}

const retryAfterDateSchema = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) return null;
  const normalized = value.trim();

  if (/^(?:0|[1-9]\d*)$/.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isSafeInteger(seconds) || seconds > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)) {
      return null;
    }
    return seconds * 1_000;
  }

  if (!retryAfterDateSchema.test(normalized)) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== normalized) return null;
  return Math.max(0, timestamp - now);
}

export function contractErrorFailure(
  payload: unknown,
  status: number,
  headerRequestId: string | null,
  retryAfter: string | null = null,
  now = Date.now(),
): ApiTransportFailure {
  const result = apiErrorEnvelopeSchema.safeParse(payload);
  if (!result.success) return invalidResponseFailure(headerRequestId);
  return {
    message: result.data.message,
    status,
    code: result.data.code,
    requestId: result.data.request_id ?? headerRequestId,
    retryAfterMs: status === 429 || status === 503
      ? parseRetryAfter(retryAfter, now)
      : null,
  };
}

export class ApiTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly requestId: string | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ApiTransportError";
  }
}

export function apiErrorEnvelope(message: string, code: ApiErrorCode, requestId: string | null): ApiErrorEnvelope {
  return { version: API_VERSION, error: message, message, code, request_id: requestId };
}
