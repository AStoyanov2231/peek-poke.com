import {
  availabilityReadResponseSchema,
  availabilityResponseSchema,
  availabilityUpsertRequestSchema,
  type AvailabilityReadResponse,
  type AvailabilityResponse,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export type AvailabilityReadOptions = {
  radiusKm?: 2 | 10 | 25;
  signal?: AbortSignal;
};

export function fetchAvailability(
  { radiusKm = 25, signal }: AvailabilityReadOptions = {},
): Promise<AvailabilityReadResponse> {
  return apiFetch(`/api/availability?radiusKm=${radiusKm}`, {
    signal,
    responseSchema: availabilityReadResponseSchema,
  });
}

export function saveAvailability(
  request: AvailabilityUpsertRequest,
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const body = availabilityUpsertRequestSchema.parse(request);
  return apiFetch("/api/availability", {
    method: "PUT",
    body: jsonBody(body),
    signal,
    responseSchema: availabilityResponseSchema,
  });
}

export function clearAvailability(
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  return apiFetch("/api/availability", {
    method: "DELETE",
    signal,
    responseSchema: availabilityResponseSchema,
  });
}
