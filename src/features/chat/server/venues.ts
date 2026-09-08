import { venueSuggestionsResponseSchema, type VenueCard } from "@peekpoke/shared/chat-assistance";

export interface VenueProvider { nearby(center: { latitude: number; longitude: number }): Promise<VenueCard[]>; }

// These are public places where meeting suggestions make sense. Search Nearby
// accepts includedTypes and still returns its primaryType, so validate both the
// request and response rather than trusting a provider's ranking alone.
export const PUBLIC_MEETING_PLACE_TYPES = new Set([
  "bar", "cafe", "library", "museum", "park", "restaurant", "tourist_attraction",
]);

export type CoarseLocation = { latitude: number; longitude: number };

export function isValidLocation(value: unknown): value is CoarseLocation {
  if (!value || typeof value !== "object") return false;
  const { latitude, longitude } = value as Record<string, unknown>;
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/** Never derive a provider center from raw coordinates. Each location is first
 * reduced to its public 2-decimal cell, then the resulting midpoint is rounded.
 */
export function coarseMidpoint(first: CoarseLocation, second: CoarseLocation): CoarseLocation {
  const roundCell = (value: number) => Math.round(value * 100) / 100;
  return {
    latitude: roundCell((roundCell(first.latitude) + roundCell(second.latitude)) / 2),
    longitude: roundCell((roundCell(first.longitude) + roundCell(second.longitude)) / 2),
  };
}

export class GooglePlacesVenueProvider implements VenueProvider {
  constructor(private readonly apiKey = process.env.GOOGLE_PLACES_API_KEY) {}
  async nearby(center: CoarseLocation) {
    if (!this.apiKey) return [];
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST", signal: AbortSignal.timeout(4_000),
      headers: { "content-type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types" },
      body: JSON.stringify({
        includedTypes: [...PUBLIC_MEETING_PLACE_TYPES],
        maxResultCount: 3,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center, radius: 1500 } },
      }),
    });
    if (!response.ok) throw new Error(`Google Places request failed: ${response.status}`);
    const body = await response.json() as { places?: Array<Record<string, unknown>> };
    return (body.places ?? []).flatMap((place) => {
      const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
      const name = (place.displayName as { text?: unknown } | undefined)?.text;
      const types = Array.isArray(place.types) ? place.types.filter((type): type is string => typeof type === "string") : [];
      const matchingType = types.find((type) => PUBLIC_MEETING_PLACE_TYPES.has(type));
      return typeof place.id === "string" && typeof name === "string" && matchingType && isValidLocation(location)
        ? [{ id: place.id, name, category: matchingType, address: typeof place.formattedAddress === "string" ? place.formattedAddress : null, latitude: location.latitude, longitude: location.longitude }]
        : [];
    });
  }
}

export async function contextualVenues(center: CoarseLocation | null, provider: VenueProvider = new GooglePlacesVenueProvider()) {
  if (!center || !isValidLocation(center) || !process.env.GOOGLE_PLACES_API_KEY) return venueSuggestionsResponseSchema.parse({ source: "unavailable", venues: [] });
  const venues = await provider.nearby(center);
  // Alternate providers must already classify a result as a public venue.
  const publicVenues = venues.filter((venue) => venue.category !== null && PUBLIC_MEETING_PLACE_TYPES.has(venue.category));
  return venueSuggestionsResponseSchema.safeParse({ source: "google_places", venues: publicVenues.slice(0, 3) }).success
    ? venueSuggestionsResponseSchema.parse({ source: "google_places", venues: publicVenues.slice(0, 3) })
    : venueSuggestionsResponseSchema.parse({ source: "unavailable", venues: [] });
}
