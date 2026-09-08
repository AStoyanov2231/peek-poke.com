import { createHash } from "node:crypto";
import { meetupAcknowledgementRequestSchema } from "@peekpoke/shared";

export const MEETUP_ACKNOWLEDGEMENT_OPERATION = "meetup:acknowledge";

export function meetupAcknowledgementHash(actorId: string, value: unknown) {
  const body = meetupAcknowledgementRequestSchema.parse(value);
  return createHash("sha256")
    .update(
      JSON.stringify({
        actor_id: actorId,
        operation: MEETUP_ACKNOWLEDGEMENT_OPERATION,
        peer_id: body.peerId,
      }),
    )
    .digest("hex");
}
