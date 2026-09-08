import type { Poke } from "./social";

/**
 * Returns peers who may be offered a local meeting confirmation before the
 * server performs its authoritative relationship, freshness, and distance
 * checks. An accepted Poke establishes the same bounded social context as an
 * accepted friendship, without granting access from pending or expired Pokes.
 */
export function meetingEligiblePeerIds(
  actorId: string,
  friendIds: Iterable<string>,
  pokes: Iterable<Pick<Poke, "senderId" | "recipientId" | "status">>,
): Set<string> {
  const peerIds = new Set(friendIds);
  for (const poke of pokes) {
    if (poke.status !== "accepted") continue;
    if (poke.senderId === actorId) peerIds.add(poke.recipientId);
    if (poke.recipientId === actorId) peerIds.add(poke.senderId);
  }
  peerIds.delete(actorId);
  return peerIds;
}
