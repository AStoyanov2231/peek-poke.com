export const supportedDiscoveryRadii = [2, 10, 25] as const;

export function nextDiscoveryRadius(radius: (typeof supportedDiscoveryRadii)[number]) {
  const index = supportedDiscoveryRadii.indexOf(radius);
  return supportedDiscoveryRadii[Math.min(index + 1, supportedDiscoveryRadii.length - 1)];
}

export function splitNearbyPeople<T extends { distanceKm: number; relationship: string }>(
  people: readonly T[],
  radius: number,
) {
  const nearby = people.filter((person) => person.distanceKm <= radius);
  return {
    friends: nearby.filter((person) => person.relationship === "friend"),
    others: nearby.filter((person) => person.relationship !== "friend"),
  };
}
