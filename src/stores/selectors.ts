"use client";
import { useQuery } from "@tanstack/react-query";
import type { OwnerProfilePhoto } from "@peekpoke/shared";
import type {
  InterestTag,
  ProfileInterest,
  RoleName,
} from "@/types/database";
import type {
  FriendWithFriendshipId,
  FriendshipWithAddressee,
  FriendshipWithRequester,
  Thread,
} from "./appStore";
import {
  bootstrapQueryOptions,
  coinsQueryOptions,
  friendsQueryOptions,
  interestTagsQueryOptions,
  interestsQueryOptions,
  photosQueryOptions,
  profileQueryOptions,
  threadsQueryOptions,
} from "@/data/web-query";

const EMPTY_PHOTOS: OwnerProfilePhoto[] = [];
const EMPTY_INTERESTS: ProfileInterest[] = [];
const EMPTY_TAGS: InterestTag[] = [];
const EMPTY_FRIENDS: FriendWithFriendshipId[] = [];
const EMPTY_REQUESTS: FriendshipWithRequester[] = [];
const EMPTY_SENT_REQUESTS: FriendshipWithAddressee[] = [];
const EMPTY_THREADS: Thread[] = [];

// Profile selectors
export const useProfile = () => useQuery(profileQueryOptions).data ?? null;
export const usePhotos = () => useQuery(photosQueryOptions).data ?? EMPTY_PHOTOS;
export const useInterests = () => useQuery(interestsQueryOptions).data ?? EMPTY_INTERESTS;
export const useAllTags = () => useQuery(interestTagsQueryOptions).data ?? EMPTY_TAGS;
export const useProfileStats = () => {
  const photos = useQuery(photosQueryOptions).data;
  return {
    photos_count: photos?.length ?? 0,
    // Kept in the compatibility type; connection data is not loaded by the
    // QR-room profile flow.
    friends_count: 0,
  };
};
export const useIsProfileLoaded = () => useQuery(profileQueryOptions).isSuccess;
export const useIsPremium = () =>
  useQuery(bootstrapQueryOptions).data?.roles.includes("subscriber") ?? false;
export const useHasRole = (roleName: RoleName) =>
  useQuery(bootstrapQueryOptions).data?.roles.includes(roleName) ?? false;

// Friends selectors
export const useFriends = () => useQuery(friendsQueryOptions).data?.friends ?? EMPTY_FRIENDS;
export const useFriendRequests = () => useQuery(friendsQueryOptions).data?.requests ?? EMPTY_REQUESTS;
export const useSentRequests = () => useQuery(friendsQueryOptions).data?.sentRequests ?? EMPTY_SENT_REQUESTS;
export const useFriendRequestCount = () =>
  useQuery(friendsQueryOptions).data?.requests.length ?? 0;
export const useIsFriendsLoaded = () => useQuery(friendsQueryOptions).isSuccess;

// Messages selectors
export const useThreads = () => useQuery(threadsQueryOptions).data?.threads ?? EMPTY_THREADS;
export const useTotalUnread = () => {
  return useQuery(bootstrapQueryOptions).data?.unread_summary.rooms ?? 0;
};
export const useIsMessagesLoaded = () => useQuery(threadsQueryOptions).isSuccess;

// Coins selectors
export const useCoins = () => useQuery(coinsQueryOptions).data?.balance ?? 0;

// Loading selectors
export const useIsPreloading = () => useQuery(bootstrapQueryOptions).isPending;
