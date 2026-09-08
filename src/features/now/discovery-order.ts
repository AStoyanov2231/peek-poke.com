import type { AvailablePerson } from "@peekpoke/shared";

/** Filtering retains v2's affinity order, which the server has already ranked. */
export function activePeopleWithinRadius(
  people: readonly AvailablePerson[],
  radiusKm: number,
  now: number,
): AvailablePerson[] {
  return people.filter(
    (person) =>
      Date.parse(person.availability.expiresAt) > now &&
      person.distanceKm <= radiusKm,
  );
}
