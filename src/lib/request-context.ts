import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { apiErrorEnvelope } from "@peekpoke/shared/errors";

const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export type RequestContext = {
  requestId: string;
  startedAt: number;
  route: string;
  method: string;
  requestBytes: number | null;
};

function safeRequestId(value: string | null): string {
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

function contentLength(source: { headers: Headers }): number | null {
  const value = source.headers.get("content-length");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function privacySafeRoute(request: Request): string {
  const pathname = new URL(request.url).pathname;
  return pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
}

export function createRequestContext(request: Request): RequestContext {
  return {
    requestId: safeRequestId(request.headers.get(REQUEST_ID_HEADER)),
    startedAt: performance.now(),
    route: privacySafeRoute(request),
    method: request.method,
    requestBytes: contentLength(request),
  };
}

function writeRequestLog(
  context: RequestContext,
  response: Response,
  error?: unknown,
) {
  const log = {
    event: "http_request",
    request_id: context.requestId,
    route: context.route,
    method: context.method,
    status: response.status,
    duration_ms: Math.round(performance.now() - context.startedAt),
    request_bytes: context.requestBytes,
    response_bytes: contentLength(response),
    auth_calls: null,
    database_ms: null,
    rpc_ms: null,
    realtime_connections: null,
    cache_hit: null,
    queue_age_ms: null,
    error_type: error instanceof Error ? error.name : null,
  };

  if (response.status >= 500 || error) console.error(JSON.stringify(log));
  else console.info(JSON.stringify(log));
}

export function finishRequest(
  context: RequestContext,
  response: Response,
  error?: unknown,
): Response {
  response.headers.set(REQUEST_ID_HEADER, context.requestId);
  writeRequestLog(context, response, error);
  return response;
}

export function withRequestContext<
  R extends Request,
  Args extends unknown[],
>(
  handler: (request: R, ...args: Args) => Promise<Response> | Response,
) {
  return async (request: R, ...args: Args): Promise<Response> => {
    const context = createRequestContext(request);
    return requestContextStorage.run(context, async () => {
      request.headers.set(REQUEST_ID_HEADER, context.requestId);
      try {
        return finishRequest(context, await handler(request, ...args));
      } catch (error) {
        const response = Response.json(
          apiErrorEnvelope("Internal server error", "INTERNAL_ERROR", context.requestId),
          { status: 500 },
        );
        return finishRequest(context, response, error);
      }
    });
  };
}

export function currentRequestId() {
  return requestContextStorage.getStore()?.requestId;
}

export function tracedFetch(requestId = currentRequestId()) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (requestId) headers.set(REQUEST_ID_HEADER, requestId);
    const startedAt = performance.now();
    try {
      const response = await fetch(input, { ...init, headers });
      console.info(JSON.stringify({
        event: "external_request",
        provider: "supabase",
        request_id: requestId ?? null,
        status: response.status,
        duration_ms: Math.round(performance.now() - startedAt),
      }));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        event: "external_request",
        provider: "supabase",
        request_id: requestId ?? null,
        status: null,
        duration_ms: Math.round(performance.now() - startedAt),
        error_type: error instanceof Error ? error.name : "unknown",
      }));
      throw error;
    }
  };
}

export function requestClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "unknown-client";
}
