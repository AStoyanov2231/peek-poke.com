import {
  meetupAcknowledgementRequestSchema,
  meetupAcknowledgementResponseSchema,
  meetupAcknowledgementReadResponseSchema,
  type MeetupAcknowledgementResponse,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";

export function acknowledgeMeetup(
  peerId: string,
  idempotencyKey: string,
): Promise<MeetupAcknowledgementResponse> {
  return fetchContract("/api/meetups", meetupAcknowledgementResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(meetupAcknowledgementRequestSchema.parse({ peerId })),
  });
}

export function fetchMeetupAcknowledgement(
  peerId: string,
  signal?: AbortSignal,
) {
  return fetchContract(
    `/api/meetups?peerId=${encodeURIComponent(peerId)}`,
    meetupAcknowledgementReadResponseSchema,
    { signal },
  );
}
