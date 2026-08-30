import {
  blockUserResponseSchema,
  createBlockUserAttemptCoordinator,
  bootstrapSchema,
  createFriendResponseAttemptCoordinator,
  createFriendRequestAttemptCoordinator,
  createFriendRemovalAttemptCoordinator,
  dmThreadCreateRequestSchema,
  dmThreadCreateResponseSchemaFor,
  dmInboxResponseSchema,
  friendsReadResponseSchema,
  friendshipCreateResponseSchema,
  friendshipRemovalResponseSchema,
  friendshipResponseSchema,
  inviteAcceptanceResponseSchemaForToken,
  inviteLinkResponseSchemaForOrigin,
  type Bootstrap,
  type BlockUserResponse,
  type DmThreadCreateResponse,
  type DmInboxResponse,
  type Friend,
  type FriendshipCreateResponse,
  type FriendshipRemovalResponse,
  type FriendshipResponse,
  type FriendsReadResponse,
  type InviteAcceptanceResponse,
  type InviteLinkResponse,
  type ProfileCard,
} from "@peekpoke/shared";
import { randomUUID } from "expo-crypto";
import { apiFetch, jsonBody } from "@/lib/api";
import { env } from "@/lib/env";

export type SocialProfileCard = ProfileCard & { roles?: string[] };
export type SocialFriend = Omit<Friend, "requester" | "addressee"> & {
  requester?: SocialProfileCard;
  addressee?: SocialProfileCard;
};

export type SocialData = {
  friends: SocialFriend[];
  requests: SocialFriend[];
  sentRequests: SocialFriend[];
  sentRequestUserIds: string[];
};

export type InboxData = DmInboxResponse;

export type FriendshipMutationData = FriendshipResponse;

export type ThreadMutationData = DmThreadCreateResponse;

export type InviteAcceptance = InviteAcceptanceResponse;

const inFlightThreadCreates = new Map<string, Promise<ThreadMutationData>>();
const inFlightInviteAccepts = new Map<string, Promise<InviteAcceptance>>();
const friendRequestAttempts = createFriendRequestAttemptCoordinator(() => randomUUID());
const friendResponseAttempts = createFriendResponseAttemptCoordinator(() => randomUUID());
const friendRemovalAttempts = createFriendRemovalAttemptCoordinator(() => randomUUID());
const blockUserAttempts = createBlockUserAttemptCoordinator(() => randomUUID());

export function fetchBootstrapIdentity(): Promise<Bootstrap> {
  return apiFetch("/api/bootstrap", { responseSchema: bootstrapSchema });
}

export function fetchSocial(): Promise<SocialData> {
  return apiFetch<FriendsReadResponse>("/api/friends?limit=100", { responseSchema: friendsReadResponseSchema })
    .then(({ friends, requests, sentRequests, sentRequestUserIds }) => ({
      friends,
      requests,
      sentRequests,
      sentRequestUserIds,
    }));
}

export function fetchInbox(): Promise<InboxData> {
  return apiFetch("/api/dm/threads?limit=100", { responseSchema: dmInboxResponseSchema });
}

export function respondToFriendRequest(
  friendshipId: string,
  status: "accepted" | "declined",
  commit?: (response: FriendshipMutationData) => void,
): Promise<FriendshipMutationData> {
  return friendResponseAttempts.run(
    friendshipId,
    status,
    (attempt) => apiFetch(`/api/friends/${encodeURIComponent(attempt.friendshipId)}`, {
      method: "PATCH",
      body: attempt.serializedBody,
      headers: {
        "content-type": "application/json",
        "idempotency-key": attempt.key,
      },
      responseSchema: friendshipResponseSchema,
    }),
    commit,
  );
}

export function resetFriendMutationAttempts() {
  friendRequestAttempts.reset();
  friendResponseAttempts.reset();
  friendRemovalAttempts.reset();
  blockUserAttempts.reset();
}

export function removeFriendship(
  friendshipId: string,
  commit?: (response: FriendshipRemovalResponse) => void,
): Promise<FriendshipRemovalResponse> {
  return friendRemovalAttempts.run(
    friendshipId,
    (attempt) => apiFetch(`/api/friends/${encodeURIComponent(attempt.friendshipId)}`, {
      method: "DELETE",
      headers: { "idempotency-key": attempt.key },
      responseSchema: friendshipRemovalResponseSchema,
    }),
    commit,
  );
}

export function pendingFriendshipRemoval(friendshipId: string) {
  return friendRemovalAttempts.peek(friendshipId);
}

export function discardFriendshipRemoval(friendshipId: string) {
  return friendRemovalAttempts.discard(friendshipId);
}

export function blockUser(
  targetUserId: string,
  commit?: (response: BlockUserResponse) => void,
): Promise<BlockUserResponse> {
  return blockUserAttempts.run(
    targetUserId,
    (attempt) => apiFetch(`/api/users/${encodeURIComponent(attempt.targetUserId)}/block`, {
      method: "POST",
      headers: { "idempotency-key": attempt.key },
      responseSchema: blockUserResponseSchema,
    }),
    commit,
  );
}

export function pendingBlockUser(targetUserId: string) {
  return blockUserAttempts.peek(targetUserId);
}

export function discardBlockUser(targetUserId: string) {
  return blockUserAttempts.discard(targetUserId);
}

export function sendFriendRequest(
  addresseeId: string,
  commit?: (response: FriendshipCreateResponse) => void,
): Promise<FriendshipCreateResponse> {
  return friendRequestAttempts.run(
    addresseeId,
    (attempt) => apiFetch("/api/friends", {
      method: "POST",
      body: attempt.serializedBody,
      headers: {
        "content-type": "application/json",
        "idempotency-key": attempt.key,
      },
      responseSchema: friendshipCreateResponseSchema,
    }),
    commit,
  );
}

export function cancelFriendRequestAttempt(addresseeId: string) {
  return friendRequestAttempts.cancel(addresseeId);
}

export function createOrFindThread(userId: string): Promise<ThreadMutationData> {
  const body = dmThreadCreateRequestSchema.parse({ user_id: userId });
  const existing = inFlightThreadCreates.get(body.user_id);
  if (existing) return existing;

  const request = apiFetch<ThreadMutationData>(`/api/dm/threads`, {
    method: "POST",
    body: jsonBody(body),
    headers: { "idempotency-key": randomUUID() },
    responseSchema: dmThreadCreateResponseSchemaFor(body.user_id),
  });
  const shared = request.finally(() => {
    if (inFlightThreadCreates.get(body.user_id) === shared) {
      inFlightThreadCreates.delete(body.user_id);
    }
  });
  inFlightThreadCreates.set(body.user_id, shared);
  return shared;
}

export function fetchInviteLink(signal?: AbortSignal): Promise<InviteLinkResponse> {
  return apiFetch("/api/invites", {
    cache: "no-store",
    signal,
    responseSchema: inviteLinkResponseSchemaForOrigin(env.apiBaseUrl, {
      allowDevelopmentHttp: typeof __DEV__ !== "undefined" && __DEV__,
    }),
  });
}

export function acceptInvite(token: string): Promise<InviteAcceptance> {
  const existing = inFlightInviteAccepts.get(token);
  if (existing) return existing;

  const request = apiFetch<InviteAcceptance>(`/api/invites/${encodeURIComponent(token)}`, {
    method: "POST",
    cache: "no-store",
    responseSchema: inviteAcceptanceResponseSchemaForToken(token),
  });
  const shared = request.finally(() => {
    if (inFlightInviteAccepts.get(token) === shared) inFlightInviteAccepts.delete(token);
  });
  inFlightInviteAccepts.set(token, shared);
  return shared;
}
