import { createHash } from "node:crypto";

export const MEETING_OPERATION = "coin_meeting:record";

export function meetingHash(actorId: string, friendId: string) {
  return createHash("sha256").update(JSON.stringify({
    actor_id: actorId,
    operation: MEETING_OPERATION,
    friend_id: friendId,
  })).digest("hex");
}
