import { randomUUID } from "expo-crypto";
import {
  pokeCreateRequestSchema,
  pokeCreateResponseSchema,
  pokeInboxResponseSchema,
  pokeResponseRequestSchema,
  pokeResponseSchema,
  type PokeCreateRequest,
  type PokeInboxResponse,
  type PokeResponseRequest,
  type PokeResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

const responseIdempotencyKeys = new Map<string, string>();

export function fetchPokes(signal?: AbortSignal): Promise<PokeInboxResponse> {
  return apiFetch("/api/pokes?limit=20", {
    signal,
    responseSchema: pokeInboxResponseSchema,
  });
}

export function createPoke(
  request: PokeCreateRequest,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
) {
  const body = pokeCreateRequestSchema.parse(request);
  return apiFetch("/api/pokes", {
    method: "POST",
    body: jsonBody(body),
    signal: options.signal,
    headers: { "idempotency-key": options.idempotencyKey ?? randomUUID() },
    responseSchema: pokeCreateResponseSchema,
  });
}

export function respondToPoke(
  id: string,
  request: PokeResponseRequest,
  signal?: AbortSignal,
): Promise<PokeResponse> {
  const body = pokeResponseRequestSchema.parse(request);
  const attemptKey = `${id}:${body.action}`;
  const idempotencyKey =
    responseIdempotencyKeys.get(attemptKey) ?? randomUUID();
  responseIdempotencyKeys.set(attemptKey, idempotencyKey);
  return apiFetch<PokeResponse>(`/api/pokes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: jsonBody(body),
    signal,
    headers: { "idempotency-key": idempotencyKey },
    responseSchema: pokeResponseSchema,
  }).then((response) => {
    responseIdempotencyKeys.delete(attemptKey);
    return response;
  });
}
