import { createHash } from "node:crypto";

export const FRIEND_REMOVAL_OPERATION = "friendship:remove";

export function friendRemovalHash(actorId: string, friendshipId: string) {
  const canonical = JSON.stringify({
    actor_id: actorId,
    operation: FRIEND_REMOVAL_OPERATION,
    friendship_id: friendshipId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
