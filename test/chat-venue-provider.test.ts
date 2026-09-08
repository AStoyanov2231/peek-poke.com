import { afterEach, describe, expect, it, vi } from "vitest";
import { coarseMidpoint, GooglePlacesVenueProvider, contextualVenues } from "@/features/chat/server/venues";

describe("Google venue adapter", () => {
  const previousKey = process.env.GOOGLE_PLACES_API_KEY;
  afterEach(() => { process.env.GOOGLE_PLACES_API_KEY = previousKey; vi.unstubAllGlobals(); });

  it("uses Nearby Search's type restriction and drops a non-public result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [
      { id: "cafe", displayName: { text: "Public Cafe" }, formattedAddress: "1 Main", primaryType: "cafe", types: ["cafe", "food"], location: { latitude: 42.7, longitude: 23.32 } },
      { id: "home", displayName: { text: "Private home" }, primaryType: "premise", types: ["premise"], location: { latitude: 42.7, longitude: 23.32 } },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const venues = await new GooglePlacesVenueProvider("key").nearby({ latitude: 42.7, longitude: 23.32 });
    expect(venues).toEqual([expect.objectContaining({ id: "cafe", category: "cafe" })]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.includedTypes).toContain("cafe");
    expect(body.includedTypes).not.toContain("premise");
    expect(fetchMock.mock.calls[0][1].headers["X-Goog-FieldMask"]).toContain("places.types");
  });

  it("never turns malformed or non-public provider data into cards", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test";
    const result = await contextualVenues({ latitude: 42.7, longitude: 23.32 }, {
      nearby: async () => [
        { id: "home", name: "Private home", category: "premise", address: null, latitude: 42.7, longitude: 23.32 },
      ],
    });
    expect(result).toEqual({ source: "google_places", venues: [] });
  });

  it("rounds the source cells before calculating a provider midpoint", () => {
    expect(coarseMidpoint({ latitude: 42.6977, longitude: 23.3219 }, { latitude: 42.7032, longitude: 23.33 }))
      .toEqual({ latitude: 42.7, longitude: 23.33 });
  });
});
