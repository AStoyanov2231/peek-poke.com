import { discoveryPreferenceSchema, type DiscoveryPreference } from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export const fetchDiscoveryPreference = () => fetchContract("/api/discovery-preferences", discoveryPreferenceSchema);
export const saveDiscoveryPreference = (preference: DiscoveryPreference) => fetchContract("/api/discovery-preferences", discoveryPreferenceSchema, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(discoveryPreferenceSchema.parse(preference)) });
