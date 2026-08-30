import { createHash } from "node:crypto";
import { friendshipCreateRequestSchema } from "@peekpoke/shared";

export const FRIEND_REQUEST_CREATE_OPERATION = "friend_request:create";

export function friendRequestHash(actorId: string, value: unknown) {
  const body = friendshipCreateRequestSchema.parse(value);
  const canonical = JSON.stringify({
    actor_id: actorId,
    operation: FRIEND_REQUEST_CREATE_OPERATION,
    target_id: body.addressee_id,
    body,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
