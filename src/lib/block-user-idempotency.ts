import { createHash } from "node:crypto";

export const USER_BLOCK_OPERATION = "user:block";

export function blockUserHash(actorId: string, blockedId: string) {
  const canonical = JSON.stringify({
    actor_id: actorId,
    operation: USER_BLOCK_OPERATION,
    blocked_id: blockedId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
