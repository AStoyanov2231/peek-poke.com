import {
  availabilityReadResponseSchema,
  availabilityResponseSchema,
  availabilityUpsertRequestSchema,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
export function fetchAvailability(signal?: AbortSignal) {
  return fetchContract(
    "/api/availability?limit=100&radiusKm=25",
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
