"use client";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  roomBootstrapSchema,
  boundedCursorPath,
  coinsResponseSchema,
  currentProfileResponseSchema,
  roomCurrentProfileResponseSchema,
  dmInboxResponseSchema,
  friendsReadResponseSchema,
  interestCatalogResponseSchema,
  messagesResponseSchema,
  meetingResponseSchema,
  createMeetingAttemptCoordinator,
  createMeetingCompletionRegistry,
  StaleMeetingAttemptError,
  ownerProfilePhotoDeleteResponseSchema,
  ownerProfilePhotoMutationResponseSchemaForStorageOrigin,
  ownerProfilePhotosResponseSchemaForStorageOrigin,
  ownerProfilePatchRequestSchema,
  ownerProfileUpdateResponseSchema,
  profileInterestsResponseSchema,
  publicProfileResponseSchemaForTarget,
  type RoomBootstrap,
  type CurrentProfile,
  type OwnerProfilePhoto,
  type OwnerProfilePatchRequest,
  type ProfileCard,
  type ProfileInterestDto,
  type RoomPublicProfileResponse,
  type MessagesResponse,
  type MeetingResponse,
} from "@peekpoke/shared";
import type {
  FriendWithFriendshipId,
  FriendshipWithAddressee,
  FriendshipWithRequester,
  Thread,
} from "@/stores/appStore";
import { fetchContract, fetchJson } from "@/lib/typed-api";

export { ApiTransportError as WebQueryError } from "@peekpoke/shared";

export const WEB_QUERY_STALE_TIME = {
  bootstrap: 60_000,
  profile: 60_000,
  social: 15_000,
  inbox: 10_000,
  catalog: 60 * 60_000,
} as const;

export const webQueryKeys = {
  bootstrap: ["web", "bootstrap"] as const,
  profile: ["web", "profile"] as const,
  roomProfile: ["web", "room-profile"] as const,
  photos: ["web", "profile", "photos"] as const,
  interests: ["web", "profile", "interests"] as const,
  interestTags: ["web", "interest-tags"] as const,
  friends: ["web", "friends"] as const,
  threads: ["web", "threads"] as const,
  rooms: ["web", "rooms"] as const,
  messages: (threadId: string) => ["web", "threads", threadId, "messages"] as const,
  roomMessages: (roomId: string) => ["web", "rooms", roomId, "messages"] as const,
  coins: ["web", "coins"] as const,
  publicProfile: (userId: string) => ["web", "profile", userId] as const,
  tagSuggestions: (prefix: string) => ["web", "search", "tags", prefix] as const,
  userSearch: (nameQuery: string, tagIds: string[], nearbyIds: string[]) =>
    [
      "web",
      "search",
      "users",
      nameQuery,
      [...tagIds].sort(),
      [...nearbyIds].sort(),
    ] as const,
} as const;

export type FriendsQueryData = {
  friends: FriendWithFriendshipId[];
  requests: FriendshipWithRequester[];
  sentRequests: FriendshipWithAddressee[];
  sentRequestUserIds: string[];
};

function profileFromCard(profile: ProfileCard): CurrentProfile {
  return {
    ...profile,
    bio: null,
    cover_image_url: null,
    created_at: new Date(0).toISOString(),
    onboarding_completed: true,
    last_seen_at: profile.last_seen_at ?? new Date(0).toISOString(),
    roles: (profile.roles ?? ["user"]) as CurrentProfile["roles"],
  };
}

export type ThreadsQueryData = {
  threads: Thread[];
  totalUnread: number;
};

export type ThreadQueryData = MessagesResponse;

export type PublicProfileData = RoomPublicProfileResponse;

const meetingAttempts = createMeetingAttemptCoordinator(() => crypto.randomUUID());
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

function profileStorageOrigin() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function fetchOwnerProfilePhotos(signal?: AbortSignal) {
  return fetchContract(
    "/api/profile/photos?limit=100",
    ownerProfilePhotosResponseSchemaForStorageOrigin(profileStorageOrigin()),
    { signal },
  ).then((response) => response.photos);
}

export function uploadOwnerProfilePhoto(body: FormData) {
  return fetchContract("/api/profile/photos", ownerProfilePhotoMutationResponseSchemaForStorageOrigin(profileStorageOrigin()), {
    method: "POST",
    body,
  }).then((response) => response.photo);
}

export function uploadOwnerProfileCover(body: FormData) {
  return fetchContract("/api/profile/cover", ownerProfilePhotoMutationResponseSchemaForStorageOrigin(profileStorageOrigin()), {
    method: "POST",
    body,
  }).then((response) => response.photo);
}

export function updateOwnerProfilePhoto(
  photoId: string,
  updates: { is_avatar?: boolean; is_private?: boolean },
) {
  return fetchContract(
    `/api/profile/photos/${encodeURIComponent(photoId)}`,
    ownerProfilePhotoMutationResponseSchemaForStorageOrigin(profileStorageOrigin()),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    },
  ).then((response) => response.photo);
}

export function deleteOwnerProfilePhoto(photoId: string) {
  return fetchContract(
    `/api/profile/photos/${encodeURIComponent(photoId)}`,
    ownerProfilePhotoDeleteResponseSchema,
    { method: "DELETE" },
  );
}

export function updateOwnerProfile(
  updates: OwnerProfilePatchRequest,
  signal?: AbortSignal,
): Promise<CurrentProfile> {
  const canonicalUpdates = ownerProfilePatchRequestSchema.parse(updates);
  return fetchContract("/api/profile", ownerProfileUpdateResponseSchema, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(canonicalUpdates),
    signal,
  }).then((response) => response.profile);
}

export const bootstrapQueryOptions = queryOptions({
  queryKey: webQueryKeys.bootstrap,
  queryFn: ({ signal }): Promise<RoomBootstrap> =>
    fetchContract("/api/bootstrap?surface=rooms", roomBootstrapSchema, { signal }),
  staleTime: WEB_QUERY_STALE_TIME.bootstrap,
});

export const profileQueryOptions = queryOptions({
  queryKey: webQueryKeys.profile,
  queryFn: async ({ signal }) => {
    const data = await fetchContract("/api/profile", currentProfileResponseSchema, { signal });
    return data.profile;
  },
  staleTime: WEB_QUERY_STALE_TIME.profile,
});

export const roomProfileQueryOptions = queryOptions({
  queryKey: webQueryKeys.roomProfile,
  queryFn: async ({ signal }) => {
    const data = await fetchContract("/api/profile?surface=rooms", roomCurrentProfileResponseSchema, { signal });
    return data.profile;
  },
  staleTime: WEB_QUERY_STALE_TIME.profile,
});

export const photosQueryOptions = queryOptions({
  queryKey: webQueryKeys.photos,
  queryFn: ({ signal }): Promise<OwnerProfilePhoto[]> => fetchOwnerProfilePhotos(signal),
  staleTime: WEB_QUERY_STALE_TIME.profile,
});

export const interestsQueryOptions = queryOptions({
  queryKey: webQueryKeys.interests,
  queryFn: async ({ signal }) => {
    const data = await fetchContract("/api/profile/interests", profileInterestsResponseSchema, { signal });
    return data.interests;
  },
  staleTime: WEB_QUERY_STALE_TIME.profile,
});

export const interestTagsQueryOptions = queryOptions({
  queryKey: webQueryKeys.interestTags,
  queryFn: async ({ signal }) => {
    const data = await fetchContract("/api/interests", interestCatalogResponseSchema, { signal });
    return data.tags;
  },
  staleTime: WEB_QUERY_STALE_TIME.catalog,
});

export const friendsQueryOptions = queryOptions({
  queryKey: webQueryKeys.friends,
  queryFn: async ({ signal }): Promise<FriendsQueryData> => {
    const data = await fetchContract("/api/friends?limit=100", friendsReadResponseSchema, { signal });
    const viewerId = data.viewer_id;
    return {
      friends: (data.friends ?? []).flatMap((friend) => {
        const peer = friend.requester_id === viewerId ? friend.addressee : friend.requester;
        return peer ? [{ ...profileFromCard(peer), friendship_id: friend.id }] : [];
      }),
      requests: (data.requests ?? []).flatMap((friend) => {
        if (!friend.requester) return [];
        const { requester, ...request } = friend;
        return [{ ...request, requester: profileFromCard(requester) }];
      }),
      sentRequests: (data.sentRequests ?? []).flatMap((friend) => {
        if (!friend.addressee) return [];
        const { addressee, ...request } = friend;
        return [{ ...request, addressee: profileFromCard(addressee) }];
      }),
      sentRequestUserIds: data.sentRequestUserIds,
    };
  },
  staleTime: WEB_QUERY_STALE_TIME.social,
});

export const threadsQueryOptions = queryOptions({
  queryKey: webQueryKeys.threads,
  queryFn: async ({ signal }): Promise<ThreadsQueryData> => {
    const data = await fetchContract(
      "/api/dm/threads?limit=100",
      dmInboxResponseSchema,
      { signal },
    );
    const threads: Thread[] = data.threads.map((thread) => ({
      ...thread,
      type: "dm",
      participant_1: profileFromCard(thread.participant_1),
      participant_2: profileFromCard(thread.participant_2),
    }));
    return {
      threads,
      totalUnread: data.total_unread,
    };
  },
  staleTime: WEB_QUERY_STALE_TIME.inbox,
});

export function fetchThreadMessages(
  threadId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
) {
  return fetchContract(
    boundedCursorPath(`/api/dm/${encodeURIComponent(threadId)}`, cursor),
    messagesResponseSchema,
    { signal },
  ) as Promise<ThreadQueryData>;
}

export function threadQueryOptions(threadId: string) {
  return infiniteQueryOptions({
    queryKey: webQueryKeys.messages(threadId),
    queryFn: ({ pageParam, signal }) => fetchThreadMessages(threadId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.has_more
      ? lastPage.pagination.next_cursor ?? undefined
      : undefined,
    enabled: Boolean(threadId),
    refetchOnReconnect: false,
    staleTime: WEB_QUERY_STALE_TIME.inbox,
  });
}

export function fetchCoins(signal?: AbortSignal) {
  return fetchContract("/api/coins", coinsResponseSchema, { signal });
}

export const coinsQueryOptions = queryOptions({
  queryKey: webQueryKeys.coins,
  queryFn: ({ signal }) => fetchCoins(signal),
  staleTime: WEB_QUERY_STALE_TIME.social,
});

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
    (attempt) => fetchContract("/api/coins/meeting", meetingResponseSchema, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": attempt.key,
      },
      body: attempt.serializedBody,
      signal,
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

export function publicProfileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: webQueryKeys.publicProfile(userId),
    queryFn: ({ signal }): Promise<PublicProfileData> => fetchContract(
      `/api/profile/${encodeURIComponent(userId)}?limit=100&surface=rooms`,
      publicProfileResponseSchemaForTarget(
        userId,
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        true,
      ),
      { signal },
    ),
    enabled: Boolean(userId),
    staleTime: WEB_QUERY_STALE_TIME.profile,
  });
}
