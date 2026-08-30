import type { ZodType } from "zod";
import {
  ApiTransportError,
  contractErrorFailure,
  createRequestSignal,
  invalidResponseFailure,
  parseContractPayload,
  parseRequestId,
  parseResponseJson,
} from "@peekpoke/shared";

type FetchContractOptions = RequestInit & { timeoutMs?: number };
type SuccessParser<T> = (payload: unknown, requestId: string | null) => T;

function invalidResponse(requestId: string | null) {
  const failure = invalidResponseFailure(requestId);
  return new ApiTransportError(
    failure.message,
    failure.status,
    failure.code,
    failure.requestId,
    failure.retryAfterMs,
  );
}

async function fetchApiResponse<T>(
  input: RequestInfo | URL,
  parseSuccess: SuccessParser<T>,
  init: FetchContractOptions = {},
): Promise<T> {
  const { timeoutMs, ...requestInit } = init;
  const requestSignal = createRequestSignal(init.signal, timeoutMs);
  let requestId: string | null = null;
  try {
    const response = await fetch(input, { ...requestInit, signal: requestSignal.signal });
    requestId = parseRequestId(response.headers.get("x-request-id"));

    if (!response.ok) {
      const parsed = parseResponseJson(await response.text());
      if (!parsed.success) throw invalidResponse(requestId);
      const failure = contractErrorFailure(
        parsed.data,
        response.status,
        requestId,
        response.headers.get("retry-after"),
      );
      throw new ApiTransportError(
        failure.message,
        failure.status,
        failure.code,
        failure.requestId,
        failure.retryAfterMs,
      );
    }

    const parsed = parseResponseJson(await response.text());
    if (!parsed.success) throw invalidResponse(requestId);
    return parseSuccess(parsed.data, requestId);
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    if (init.signal?.aborted) throw init.signal.reason ?? error;
    if (requestSignal.didTimeout()) {
      throw new ApiTransportError("Request timed out", 0, "REQUEST_TIMEOUT", requestId);
    }
    throw new ApiTransportError("Network unavailable", 0, "NETWORK_UNAVAILABLE");
  } finally {
    requestSignal.cleanup();
  }
}

export function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchContractOptions = {},
): Promise<T> {
  return fetchApiResponse(input, (payload) => payload as T, init);
}

export function fetchContract<T>(
  input: RequestInfo | URL,
  schema: ZodType<T>,
  init: FetchContractOptions = {},
): Promise<T> {
  return fetchApiResponse(input, (payload, requestId) => {
    try {
      return parseContractPayload(schema, payload);
    } catch {
      throw invalidResponse(requestId);
    }
  }, init);
}
