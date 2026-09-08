import {
  availabilityReadResponseSchema,
  availabilityResponseSchema,
  availabilityUpsertRequestSchema,
  type AvailabilityReadResponse,
  type AvailabilityResponse,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function fetchAvailability(
  signal?: AbortSignal,
): Promise<AvailabilityReadResponse> {
  return apiFetch("/api/availability", {
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
