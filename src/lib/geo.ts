/**
 * Geographic utility functions.
 * haversineKm was previously in useNearbyPresence.ts;
 * formatDistance was previously in NearbySwiper.tsx.
 */

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const km = haversineKm(lat1, lng1, lat2, lng2);
  const meters = km * 1000;
  return meters < 1000 ? `${Math.round(meters)} m away` : `${km.toFixed(1)} km away`;
}
