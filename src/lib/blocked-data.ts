type ThreadLike = {
  participant_1_id?: string;
  participant_2_id?: string;
  unread_count?: number;
};

type PreloadLike = {
  friends: {
    friends: Array<{ id: string }>;
    requests: Array<{ requester: { id: string } }>;
    sentRequests: Array<{ addressee: { id: string } }>;
    sentRequestUserIds: string[];
  };
  messages: {
    threads: ThreadLike[];
    totalUnread: number;
    blockedUserIds?: string[];
  };
};

export function filterBlockedThreads<T extends ThreadLike>(
  threads: T[],
  blockedPeerIds: ReadonlySet<string>
) {
  return threads.filter((thread) =>
    !blockedPeerIds.has(thread.participant_1_id ?? "") &&
    !blockedPeerIds.has(thread.participant_2_id ?? "")
  );
}

export function totalUnreadForThreads(threads: ThreadLike[]) {
  return threads.reduce((total, thread) => total + (thread.unread_count ?? 0), 0);
}

export function filterBlockedPreload<T extends PreloadLike>(
  data: T,
  blockedPeerIds: ReadonlySet<string>
): T {
  const threads = filterBlockedThreads(data.messages.threads, blockedPeerIds);
  return {
    ...data,
    friends: {
      friends: data.friends.friends.filter((friend) => !blockedPeerIds.has(friend.id)),
      requests: data.friends.requests.filter((request) => !blockedPeerIds.has(request.requester.id)),
      sentRequests: data.friends.sentRequests.filter((request) => !blockedPeerIds.has(request.addressee.id)),
      sentRequestUserIds: data.friends.sentRequestUserIds.filter((id) => !blockedPeerIds.has(id)),
    },
    messages: {
      ...data.messages,
      threads,
      totalUnread: totalUnreadForThreads(threads),
      blockedUserIds: [...blockedPeerIds],
    },
  } as T;
}
