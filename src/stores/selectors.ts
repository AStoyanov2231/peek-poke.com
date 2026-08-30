"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "./appStore";
import { useShallow } from "zustand/react/shallow";
import type { OwnerProfilePhoto } from "@peekpoke/shared";
import type {
  InterestTag,
  NearbyUser,
  ProfileInterest,
  RoleName,
} from "@/types/database";
import type {
  Bot,
  FriendWithFriendshipId,
  FriendshipWithAddressee,
  FriendshipWithRequester,
  Thread,
} from "./appStore";
import {
  bootstrapQueryOptions,
  botsQueryOptions,
  coinsQueryOptions,
  friendsQueryOptions,
  interestTagsQueryOptions,
  interestsQueryOptions,
  nearbyQueryOptions,
  photosQueryOptions,
  profileQueryOptions,
  publicProfileQueryOptions,
  threadsQueryOptions,
} from "@/data/web-query";
import { roomsQueryOptions } from "@/data/rooms";
import { locationIsFreshForViewer } from "@/features/map/location-sync";

const EMPTY_PHOTOS: OwnerProfilePhoto[] = [];
const EMPTY_INTERESTS: ProfileInterest[] = [];
const EMPTY_TAGS: InterestTag[] = [];
const EMPTY_FRIENDS: FriendWithFriendshipId[] = [];
const EMPTY_REQUESTS: FriendshipWithRequester[] = [];
const EMPTY_SENT_REQUESTS: FriendshipWithAddressee[] = [];
const EMPTY_THREADS: Thread[] = [];
const EMPTY_NEARBY: NearbyUser[] = [];
const EMPTY_BOTS: Bot[] = [];

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
  const rooms = useQuery(roomsQueryOptions).data?.rooms ?? [];
  return rooms.reduce((total, room) => total + room.unread_count, 0);
};
export const useIsMessagesLoaded = () => useQuery(threadsQueryOptions).isSuccess;

// Coins selectors
export const useCoins = () => useQuery(coinsQueryOptions).data?.balance ?? 0;

// Loading selectors
export const useIsPreloading = () => useQuery(bootstrapQueryOptions).isPending;
// Location selectors
export const useUserLocation = () => useAppStore((state) => state.userLocation);
export const useLocationStatus = () => useAppStore((state) => state.locationStatus);
export const useLocationFreshness = (viewerId: string | undefined) => {
  const userLocation = useUserLocation();
  const locationStatus = useLocationStatus();
  const locationFreshForUserId = useAppStore((state) => state.locationFreshForUserId);
  const locationAcknowledgedAt = useAppStore((state) => state.locationAcknowledgedAt);
  return locationIsFreshForViewer({
    userLocation,
    locationStatus,
    locationFreshForUserId,
    locationAcknowledgedAt,
  }, viewerId);
};
export const useNearbyUsers = () => {
  const location = useUserLocation();
  const viewerId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const locationFresh = useLocationFreshness(viewerId);
  const data = useQuery({ ...nearbyQueryOptions(location, viewerId), enabled: false }).data;
  return locationFresh ? (data ?? EMPTY_NEARBY) : EMPTY_NEARBY;
};
export const useVisibleUsers = () => {
  const nearbyUsers = useNearbyUsers();
  const visibleUserIds = useAppStore(useShallow((state) => state.visibleUserIds));
  return useMemo(() => {
    const ids = new Set(visibleUserIds);
    return nearbyUsers.filter((user) => ids.has(user.userId));
  }, [nearbyUsers, visibleUserIds]);
};
export const useSelectedClusterUserIds = () => useAppStore(useShallow((state) => state.selectedClusterUserIds));
export const useHighlightedUserId = () => useAppStore((state) => state.highlightedUserId);
export const usePendingUserId = () => {
  const userId = useHighlightedUserId();
  const query = useQuery({
    ...publicProfileQueryOptions(userId ?? ""),
    enabled: Boolean(userId),
  });
  return query.isFetching ? userId : null;
};
export const useHighlightedData = () => {
  const userId = useHighlightedUserId();
  const data = useQuery({
    ...publicProfileQueryOptions(userId ?? ""),
    enabled: Boolean(userId),
  }).data;
  return data ? { photos: data.photos, interests: data.interests } : null;
};
export const useBots = () => {
  const location = useUserLocation();
  const viewerId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const locationFresh = useLocationFreshness(viewerId);
  const data = useQuery({ ...botsQueryOptions(location, viewerId), enabled: false }).data;
  return locationFresh ? (data ?? EMPTY_BOTS) : EMPTY_BOTS;
};
