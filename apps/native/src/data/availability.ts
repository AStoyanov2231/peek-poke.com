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
  discoveryContext?: boolean;
  radiusKm?: 2 | 10 | 25;
  signal?: AbortSignal;
};

export function fetchAvailability(
  { discoveryContext = false, radiusKm = 25, signal }: AvailabilityReadOptions = {},
): Promise<AvailabilityReadResponse> {
  const query = discoveryContext
    ? `?radiusKm=${radiusKm}&discovery_context=1`
    : `?radiusKm=${radiusKm}`;
  return apiFetch(`/api/availability${query}`, {
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
