import { z } from "zod";

export const venueCardSchema = z.strictObject({
  id: z.string().min(1).max(160),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80).nullable(),
  address: z.string().trim().min(1).max(200).nullable(),
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
});

export const venueSuggestionsResponseSchema = z.strictObject({
  source: z.enum(["google_places", "unavailable"]),
  venues: z.array(venueCardSchema).max(3),
});

export type VenueCard = z.infer<typeof venueCardSchema>;
export type VenueSuggestionsResponse = z.infer<typeof venueSuggestionsResponseSchema>;
