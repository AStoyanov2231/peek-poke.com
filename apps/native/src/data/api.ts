import {
  authProfileEnsureResponseSchema,
  bootstrapSchema,
  boundedCursorPath,
  coinsResponseSchema,
  currentProfileResponseSchema,
  roomCurrentProfileResponseSchema,
  dmInboxResponseSchema,
  friendsReadResponseSchema,
  messagesResponseSchema,
  meetingResponseSchema,
  createMeetingAttemptCoordinator,
  createMeetingCompletionRegistry,
  StaleMeetingAttemptError,
  type AuthProfileEnsureResponse,
  type Bootstrap,
  type RoomCurrentProfile,
  type DmInboxResponse,
  type Friend,
  type FriendsReadResponse,
  type MessagesResponse,
  type MeetingResponse,
  type ProfileView,
} from "@peekpoke/shared";
import { randomUUID } from "expo-crypto";
import { apiFetch, jsonBody } from "@/lib/api";

export type FriendsData = {
  friends: Friend[];
  requests: Friend[];
  sentRequests: Friend[];
  sentRequestUserIds: string[];
};

export type ThreadsData = DmInboxResponse;

export type MessagesData = MessagesResponse;

const meetingAttempts = createMeetingAttemptCoordinator(() => randomUUID());
const meetingCompletions = createMeetingCompletionRegistry();
let observedMeetingOwnerId: string | null = null;
const completedMeetingResponse = Object.freeze({
  success: true,
  awarded: false,
  already_met: true,
  balance: null,
}) satisfies MeetingResponse;

function activateMeetingOwner(accountId: string) {
  const activation = meetingCompletions.activate(accountId);
  if (activation.previousAccountId) meetingAttempts.fence(activation.previousAccountId);
  observedMeetingOwnerId = activation.epoch.accountId;
  return activation.epoch;
}

function currentMeetingOwnerEpoch(accountId: string) {
  return meetingCompletions.current(accountId);
}

export function fetchBootstrap(signal?: AbortSignal): Promise<Bootstrap> {
  return apiFetch("/api/bootstrap", { signal, responseSchema: bootstrapSchema });
}

export function ensureAuthenticatedProfile(signal?: AbortSignal): Promise<AuthProfileEnsureResponse> {
  return apiFetch("/api/auth/profile", {
    method: "POST",
    body: jsonBody({}),
    signal,
    responseSchema: authProfileEnsureResponseSchema,
  });
}

export async function fetchCurrentProfile(): Promise<ProfileView> {
  const response = await apiFetch<{ profile: ProfileView | null }>("/api/profile", {
    responseSchema: currentProfileResponseSchema,
  });
  if (!response.profile) throw new Error("Profile not found");
  return response.profile;
}

export async function fetchRoomCurrentProfile(): Promise<RoomCurrentProfile> {
  const response = await apiFetch<{ profile: RoomCurrentProfile | null }>("/api/profile?surface=rooms", {
    responseSchema: roomCurrentProfileResponseSchema,
  });
  if (!response.profile) throw new Error("Profile not found");
  return response.profile;
}

export function fetchFriends(): Promise<FriendsData> {
  return apiFetch<FriendsReadResponse>("/api/friends?limit=100", { responseSchema: friendsReadResponseSchema })
    .then(({ friends, requests, sentRequests, sentRequestUserIds }) => ({
      friends,
      requests,
      sentRequests,
      sentRequestUserIds,
    }));
}

export function fetchThreads(): Promise<ThreadsData> {
  return apiFetch("/api/dm/threads?limit=100", { responseSchema: dmInboxResponseSchema });
}

export function fetchMessages(
  threadId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<MessagesData> {
  return apiFetch(boundedCursorPath(`/api/dm/${encodeURIComponent(threadId)}`, cursor), {
    signal,
    responseSchema: messagesResponseSchema,
  });
}

export function fetchCoins(): Promise<{ balance: number }> {
  return apiFetch("/api/coins", { responseSchema: coinsResponseSchema });
}

export function recordMeeting(
  accountId: string,
  friendId: string,
  signal?: AbortSignal,
  commit?: (response: MeetingResponse) => void,
  consumerId?: PropertyKey,
): Promise<MeetingResponse> {
  const epoch = currentMeetingOwnerEpoch(accountId);
  if (!epoch) return Promise.reject(new StaleMeetingAttemptError());
  if (meetingCompletions.has(epoch, friendId)) {
    return Promise.resolve().then(() => {
      if (!meetingCompletions.isCurrent(epoch)) throw new StaleMeetingAttemptError();
      commit?.(completedMeetingResponse);
      return completedMeetingResponse;
    });
  }
  const guardedCommit = commit
    ? (response: MeetingResponse) => {
      if (meetingCompletions.isCurrent(epoch)) commit(response);
    }
    : undefined;
  return meetingAttempts.run(
    accountId,
    friendId,
    (attempt) => apiFetch<MeetingResponse>("/api/coins/meeting", {
      method: "POST",
      body: attempt.serializedBody,
      headers: { "idempotency-key": attempt.key },
      signal,
      responseSchema: meetingResponseSchema,
    }).then((response) => {
      meetingCompletions.mark(epoch, friendId);
      return response;
    }),
    guardedCommit,
    consumerId,
  ).then(
    (response) => {
      if (!meetingCompletions.isCurrent(epoch)) throw new StaleMeetingAttemptError();
      return response;
    },
    (error: unknown) => {
      if (!meetingCompletions.isCurrent(epoch)) throw new StaleMeetingAttemptError();
      throw error;
    },
  );
}

export function activateMeetingCompletionOwner(accountId: string) {
  activateMeetingOwner(accountId);
}

export function observeMeetingAuthOwner(accountId: string | null) {
  if (accountId) activateMeetingCompletionOwner(accountId);
  else if (observedMeetingOwnerId !== null) resetMeetingCompletionRegistry();
}

export function meetingPairCompleted(accountId: string, friendId: string) {
  const epoch = currentMeetingOwnerEpoch(accountId);
  if (!epoch) return false;
  return meetingCompletions.has(epoch, friendId);
}

export function resetMeetingCompletionRegistry(accountId?: string) {
  const clearsObservedOwner = accountId === undefined
    || meetingCompletions.current(accountId) !== null;
  meetingAttempts.fence(accountId);
  meetingCompletions.clear(accountId);
  if (clearsObservedOwner) observedMeetingOwnerId = null;
}

export function unsubscribeMeetingAttempt(
  accountId: string,
  friendId: string,
  consumerId: PropertyKey,
) {
  return meetingAttempts.unsubscribe(accountId, friendId, consumerId);
}

export function discardMeetingAttempt(accountId: string, friendId: string) {
  return meetingAttempts.discard(accountId, friendId);
}
