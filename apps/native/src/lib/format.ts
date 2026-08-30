export function formatDistanceKm(from: { lat: number; lng: number } | null, to: { lat: number; lng: number }) {
  if (!from) return null;
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const meters = km * 1000;
  return meters < 1000 ? `${Math.round(meters)} m away` : `${km.toFixed(1)} km away`;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthKm = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLng = degToRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "Now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function joinedYear(value: string | null | undefined) {
  if (!value) return "";
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? `Joined ${year}` : "";
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}
