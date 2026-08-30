import type { DmInboxThread } from "@peekpoke/shared";
import type { QueryClient } from "@tanstack/react-query";
import { nativeQueryKeys } from "@/data/query-keys";
import type { InboxData, SocialData, SocialFriend } from "./api";

export function applyFriendResponse(
  current: SocialData | undefined,
  friendshipId: string,
  status: "accepted" | "declined",
  friend: SocialFriend | null,
): SocialData | undefined {
  if (!current) return current;

  return {
    ...current,
    requests: current.requests.filter((request) => request.id !== friendshipId),
    friends: status === "accepted" && friend
      ? upsertById(current.friends, friend)
      : current.friends,
  };
}

export function removeFriendshipFromSocial(
  current: SocialData | undefined,
  friendshipId: string,
): SocialData | undefined {
  if (!current) return current;

  const removedSentRequest = current.sentRequests.find((request) => request.id === friendshipId);
  return {
    ...current,
    friends: current.friends.filter((friend) => friend.id !== friendshipId),
    requests: current.requests.filter((request) => request.id !== friendshipId),
    sentRequests: current.sentRequests.filter((request) => request.id !== friendshipId),
    sentRequestUserIds: removedSentRequest
      ? current.sentRequestUserIds.filter((userId) => userId !== removedSentRequest.addressee_id)
      : current.sentRequestUserIds,
  };
}

export function removeBlockedUserFromSocial(
  current: SocialData | undefined,
  peerId: string,
): SocialData | undefined {
  if (!current) return current;
  const doesNotInvolvePeer = (friend: SocialFriend) =>
    friend.requester_id !== peerId && friend.addressee_id !== peerId;
  return {
    ...current,
    friends: current.friends.filter(doesNotInvolvePeer),
    requests: current.requests.filter(doesNotInvolvePeer),
    sentRequests: current.sentRequests.filter(doesNotInvolvePeer),
    sentRequestUserIds: current.sentRequestUserIds.filter((userId) => userId !== peerId),
  };
}

export function commitFriendshipBalance(queryClient: QueryClient, balance: number) {
  queryClient.setQueryData(nativeQueryKeys.coins, { balance });
}

export function commitBlockedUser(queryClient: QueryClient, peerId: string) {
  queryClient.setQueryData<SocialData>(
    nativeQueryKeys.social.friends,
    (current) => removeBlockedUserFromSocial(current, peerId),
  );
  const inbox = queryClient.getQueryData<InboxData>(nativeQueryKeys.inbox.threads);
  const removedThreadIds = inbox?.threads.flatMap((thread) =>
    thread.participant_1_id === peerId || thread.participant_2_id === peerId
      ? [thread.id]
      : []) ?? [];
  queryClient.setQueryData<InboxData>(
    nativeQueryKeys.inbox.threads,
    (current) => removePeerThreadFromInbox(current, peerId),
  );
  for (const threadId of removedThreadIds) {
    queryClient.removeQueries({ queryKey: nativeQueryKeys.chat.messages(threadId) });
  }
  queryClient.removeQueries({ queryKey: nativeQueryKeys.profile.public(peerId) });
}

export function addThreadToInbox(
  current: InboxData | undefined,
  thread: DmInboxThread | null,
): InboxData | undefined {
  if (!current || !thread) return current;
  return {
    ...current,
    threads: upsertById(current.threads, thread),
  };
}

export function removePeerThreadFromInbox(
  current: InboxData | undefined,
  peerId: string,
): InboxData | undefined {
  if (!current) return current;
  const removed = current.threads.filter(
    (thread) => thread.participant_1_id === peerId || thread.participant_2_id === peerId,
  );
  const unreadRemoved = removed.reduce((total, thread) => total + thread.unread_count, 0);
  return {
    ...current,
    threads: current.threads.filter(
      (thread) => thread.participant_1_id !== peerId && thread.participant_2_id !== peerId,
    ),
    total_unread: Math.max(0, current.total_unread - unreadRemoved),
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}
