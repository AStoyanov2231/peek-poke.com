import type { AvailablePerson } from "@peekpoke/shared";

type DiscoveryReason = NonNullable<AvailablePerson["discoveryReasons"]>[number];

const labels: Partial<Record<DiscoveryReason, string>> = {
  connected_before: "Connected before",
  mutual_friends: "Friends in common",
  mutual_meetup: "You both marked a meetup",
};

/** Keeps the server-selected reason order while avoiding details already visible on the card. */
export function conciseDiscoveryReasonLabels(
  reasons: readonly DiscoveryReason[] | undefined,
): string[] {
  const visible: string[] = [];
  for (const reason of reasons ?? []) {
    const label = labels[reason];
    if (label && !visible.includes(label)) visible.push(label);
    if (visible.length === 2) break;
  }
  return visible;
}
