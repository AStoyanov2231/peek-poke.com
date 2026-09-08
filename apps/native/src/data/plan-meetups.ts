import { randomUUID } from "expo-crypto";
import {
  planMeetupStatusResponseSchema,
  type PlanReadResponse,
  type PlanMeetupStatusResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";

const attemptKeys = new Map<string, string>();

function path(planId: string) {
  return `/api/plans/${encodeURIComponent(planId)}/meetups`;
}

export function fetchPlanMeetupStatus(
  planId: string,
  signal?: AbortSignal,
): Promise<PlanMeetupStatusResponse> {
  return apiFetch<PlanMeetupStatusResponse>(path(planId), {
    signal,
    responseSchema: planMeetupStatusResponseSchema,
  });
}

/**
 * A failed acknowledgement keeps its key so a retry cannot create a second
 * acknowledgement. The account id scopes the in-memory retry record when a
 * device changes accounts without restarting the app.
 */
export function acknowledgePlanMeetup(
  planId: string,
  peerId: string,
  accountId: string,
): Promise<PlanMeetupStatusResponse> {
  const attemptId = `${accountId}:${planId}:${peerId}`;
  const key = attemptKeys.get(attemptId) ?? randomUUID();
  attemptKeys.set(attemptId, key);
  return apiFetch<PlanMeetupStatusResponse>(path(planId), {
    method: "POST",
    body: jsonBody({ peerId }),
    headers: { "idempotency-key": key },
    responseSchema: planMeetupStatusResponseSchema,
  }).then((response) => {
    attemptKeys.delete(attemptId);
    return response;
  });
}

export function planMeetupLabel(
  acknowledgement: PlanMeetupStatusResponse["acknowledgements"][number] | undefined,
) {
  if (!acknowledgement) return "We met";
  if (acknowledgement.confirmedAt) return "Both marked it";
  if (acknowledgement.viewerConfirmed) return "Waiting for them";
  return "Confirm we met";
}

export function planMeetupShouldShowLoadError(
  hasPotentialPeer: boolean,
  isError: boolean,
) {
  return hasPotentialPeer && isError;
}

export type PlanMeetupPresentation =
  | { kind: "hidden"; peers: [] }
  | { kind: "closed"; peers: PlanReadResponse["members"] }
  | {
      kind: "active";
      peers: {
        member: PlanReadResponse["members"][number];
        acknowledgement: PlanMeetupStatusResponse["acknowledgements"][number];
      }[];
    };

/** Only the server-authorized peer set can be shown. This keeps blocked or
 * removed members out of the client even when a stale Plan detail is cached. */
export function planMeetupPresentation(
  status: PlanMeetupStatusResponse,
  members: PlanReadResponse["members"],
  accountId: string,
  now = Date.now(),
): PlanMeetupPresentation {
  const membersById = new Map(
    members
      .filter((member) => member.user_id !== accountId)
      .map((member) => [member.user_id, member]),
  );
  const peers = status.acknowledgements.flatMap((acknowledgement) => {
    const member = membersById.get(acknowledgement.peerId);
    return member ? [{ member, acknowledgement }] : [];
  });
  const hasConfirmation = peers.some(
    ({ acknowledgement }) =>
      acknowledgement.viewerConfirmed || acknowledgement.peerConfirmed,
  );
  if (status.canConfirm || hasConfirmation) return { kind: "active", peers };
  if (status.closesAt && Date.parse(status.closesAt) <= now)
    return { kind: "closed", peers: peers.map(({ member }) => member) };
  return { kind: "hidden", peers: [] };
}
