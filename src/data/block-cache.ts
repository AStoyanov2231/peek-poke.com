import type { QueryClient } from "@tanstack/react-query";
import {
  webQueryKeys,
  type FriendsQueryData,
  type ThreadsQueryData,
} from "@/data/web-query";

export function commitBlockedUserCache(
  queryClient: QueryClient,
  targetUserId: string,
  friendshipId: string | null,
  balance: number | null,
) {
  if (balance !== null) {
    queryClient.setQueryData(webQueryKeys.coins, { balance });
  }
  queryClient.setQueryData<FriendsQueryData>(webQueryKeys.friends, (current) => {
    if (!current) return current;
    return {
      ...current,
      friends: current.friends.filter((friend) =>
        friend.id !== targetUserId
        && (friendshipId === null || friend.friendship_id !== friendshipId)),
      requests: current.requests.filter((request) =>
        request.requester_id !== targetUserId && request.addressee_id !== targetUserId),
      sentRequests: current.sentRequests.filter((request) =>
        request.requester_id !== targetUserId && request.addressee_id !== targetUserId),
      sentRequestUserIds: current.sentRequestUserIds.filter((userId) => userId !== targetUserId),
    };
  });

  const inbox = queryClient.getQueryData<ThreadsQueryData>(webQueryKeys.threads);
  const removed = inbox?.threads.filter(
    (thread) =>
      thread.participant_1_id === targetUserId || thread.participant_2_id === targetUserId,
  ) ?? [];
  queryClient.setQueryData<ThreadsQueryData>(webQueryKeys.threads, (current) => {
    if (!current) return current;
    const unreadRemoved = current.threads.reduce(
      (total, thread) =>
        thread.participant_1_id === targetUserId || thread.participant_2_id === targetUserId
          ? total + (thread.unread_count ?? 0)
          : total,
      0,
    );
    return {
      threads: current.threads.filter(
        (thread) =>
          thread.participant_1_id !== targetUserId && thread.participant_2_id !== targetUserId,
      ),
      totalUnread: Math.max(0, current.totalUnread - unreadRemoved),
    };
  });
  for (const thread of removed) {
    queryClient.removeQueries({ queryKey: webQueryKeys.messages(thread.id) });
  }
  queryClient.removeQueries({ queryKey: webQueryKeys.publicProfile(targetUserId) });
}
