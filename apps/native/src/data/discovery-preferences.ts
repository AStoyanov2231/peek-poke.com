import { discoveryPreferenceSchema, type DiscoveryPreference } from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

export function fetchDiscoveryPreference(): Promise<DiscoveryPreference> {
  return apiFetch("/api/discovery-preferences", { responseSchema: discoveryPreferenceSchema });
}
export function saveDiscoveryPreference(value: DiscoveryPreference): Promise<DiscoveryPreference> {
  return apiFetch("/api/discovery-preferences", { method: "PATCH", body: jsonBody(discoveryPreferenceSchema.parse(value)), responseSchema: discoveryPreferenceSchema });
}
