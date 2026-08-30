import {
  ApiTransportError,
  contractErrorFailure,
  createRequestSignal,
  invalidResponseFailure,
  parseContractPayload,
  parseRequestId,
  parseResponseJson,
} from "@peekpoke/shared";
import { onlineManager } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { env } from "./env";
import { supabase } from "./supabase";
import { resolveApiUrl } from "./api-url";

type ApiOptions = RequestInit & {
  auth?: boolean;
  authToken?: string;
  responseSchema?: ZodType<unknown>;
  timeoutMs?: number;
};

export class ApiRequestError extends ApiTransportError {
  constructor(
    message: string,
    status: number,
    code = "INTERNAL_ERROR",
    requestId: string | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message, status, code, requestId, retryAfterMs);
    this.name = "ApiRequestError";
  }
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}

export function isFriendLimitError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError &&
    (error.code === "FRIEND_LIMIT_REACHED" || error.code === "REQUESTER_LIMIT_REACHED");
}

function buildUrl(path: string) {
  try {
    return resolveApiUrl(env.apiBaseUrl, path);
  } catch {
    throw new ApiRequestError(
      "Cross-origin API requests are not allowed",
      400,
      "INVALID_API_ORIGIN",
    );
  }
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function parseContractBody(body: string, requestId: string | null) {
  const parsed = parseResponseJson(body);
  if (parsed.success) return parsed.data;

  const failure = invalidResponseFailure(requestId);
  throw new ApiRequestError(
    failure.message,
    failure.status,
    failure.code,
    failure.requestId,
    failure.retryAfterMs,
  );
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, authToken, responseSchema, timeoutMs, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  const isFormData = typeof FormData !== "undefined" && requestInit.body instanceof FormData;

  if (!isFormData && requestInit.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (auth) {
    const token = authToken ?? await getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  const requestSignal = createRequestSignal(requestInit.signal, timeoutMs);
  let receivedResponse = false;
  let requestId: string | null = null;
  try {
    const response = await fetch(buildUrl(path), {
      ...requestInit,
      headers,
      signal: requestSignal.signal,
    });
    receivedResponse = true;
    requestId = parseRequestId(response.headers.get("x-request-id"));
    onlineManager.setOnline(true);

    if (!response.ok) {
      const data = parseContractBody(await response.text(), requestId);
      const failure = contractErrorFailure(
        data,
        response.status,
        requestId,
        response.headers.get("retry-after"),
      );
      throw new ApiRequestError(
        failure.message,
        failure.status,
        failure.code,
        failure.requestId,
        failure.retryAfterMs,
      );
    }

    const data = parseContractBody(await response.text(), requestId);
    if (!responseSchema) return data as T;
    try {
      return parseContractPayload(responseSchema as ZodType<T>, data);
    } catch {
      throw new ApiRequestError(
        "Invalid server response",
        502,
        "INVALID_RESPONSE",
        requestId,
      );
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (requestInit.signal?.aborted) throw requestInit.signal.reason ?? error;
    if (requestSignal.didTimeout()) {
      if (!receivedResponse) onlineManager.setOnline(false);
      throw new ApiRequestError("Request timed out", 0, "REQUEST_TIMEOUT", requestId);
    }
    if (!receivedResponse) onlineManager.setOnline(false);
    throw new ApiRequestError(
      "Network unavailable",
      0,
      "NETWORK_UNAVAILABLE",
      requestId,
    );
  } finally {
    requestSignal.cleanup();
  }
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
