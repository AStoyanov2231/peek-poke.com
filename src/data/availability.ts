import {
  availabilityReadResponseSchema,
  availabilityResponseSchema,
  availabilityUpsertRequestSchema,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
export type AvailabilityReadOptions = {
  discoveryContext?: boolean;
  signal?: AbortSignal;
};

export function fetchAvailability({
  discoveryContext = false,
  signal,
}: AvailabilityReadOptions = {}) {
  const query = discoveryContext
    ? "?limit=100&radiusKm=25&discovery_context=1"
    : "?limit=100&radiusKm=25";
  return fetchContract(
    `/api/availability${query}`,
    availabilityReadResponseSchema,
    { signal },
  );
}
export function saveAvailability(input: AvailabilityUpsertRequest) {
  return fetchContract("/api/availability", availabilityResponseSchema, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(availabilityUpsertRequestSchema.parse(input)),
  });
}
export function clearAvailability() {
  return fetchContract("/api/availability", availabilityResponseSchema, {
    method: "DELETE",
  });
}
