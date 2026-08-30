import { createHash } from "node:crypto";
import { friendshipResponseRequestSchema } from "@peekpoke/shared";

export const FRIEND_RESPONSE_OPERATION = "friend_request:respond";

export function friendResponseHash(
  actorId: string,
  friendshipId: string,
  value: unknown,
) {
  const body = friendshipResponseRequestSchema.parse(value);
  const canonical = JSON.stringify({
    actor_id: actorId,
    operation: FRIEND_RESPONSE_OPERATION,
    friendship_id: friendshipId,
    action: body.status,
    body,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
