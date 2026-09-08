import { randomUUID } from "expo-crypto";
import {
  meetupAcknowledgementRequestSchema,
  meetupAcknowledgementReadResponseSchema,
  meetupAcknowledgementResponseSchema,
  type MeetupAcknowledgementReadResponse,
  type MeetupAcknowledgementResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

const attemptKeys = new Map<string, string>();

export function fetchMeetupAcknowledgement(
  peerId: string,
  signal?: AbortSignal,
): Promise<MeetupAcknowledgementReadResponse> {
  return apiFetch<MeetupAcknowledgementReadResponse>(
    `/api/meetups?peerId=${encodeURIComponent(peerId)}`,
    {
      signal,
      responseSchema: meetupAcknowledgementReadResponseSchema,
    },
  );
}

export function acknowledgeMeetup(
  peerId: string,
  attemptId: string,
): Promise<MeetupAcknowledgementResponse> {
  const body = meetupAcknowledgementRequestSchema.parse({ peerId });
  const key = attemptKeys.get(attemptId) ?? randomUUID();
  attemptKeys.set(attemptId, key);
  return apiFetch<MeetupAcknowledgementResponse>("/api/meetups", {
    method: "POST",
    body: jsonBody(body),
    headers: { "idempotency-key": key },
    responseSchema: meetupAcknowledgementResponseSchema,
  }).then((response) => {
    attemptKeys.delete(attemptId);
    return response;
  });
}
