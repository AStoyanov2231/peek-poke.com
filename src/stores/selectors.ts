"use client";
import { useAppStore } from "./appStore";
import type { RoleName } from "@/types/database";

// Profile selectors
export const useProfile = () => useAppStore((state) => state.profile);
export const usePhotos = () => useAppStore((state) => state.photos);
export const useInterests = () => useAppStore((state) => state.interests);
export const useAllTags = () => useAppStore((state) => state.allTags);
export const useProfileStats = () => useAppStore((state) => state.stats);
export const useIsProfileLoaded = () => useAppStore((state) => state.isProfileLoaded);
export const useIsPremium = () =>
  useAppStore((state) => state.profile?.roles?.includes("subscriber") ?? false);
export const useHasRole = (roleName: RoleName) =>
  useAppStore((state) => state.profile?.roles?.includes(roleName) ?? false);

// Friends selectors
export const useFriends = () => useAppStore((state) => state.friends);
export const useFriendRequests = () => useAppStore((state) => state.requests);
export const useSentRequests = () => useAppStore((state) => state.sentRequests);
export const useFriendRequestCount = () => useAppStore((state) => state.requests.length);
export const useIsFriendsLoaded = () => useAppStore((state) => state.isFriendsLoaded);

// Messages selectors
export const useThreads = () => useAppStore((state) => state.threads);
export const useTotalUnread = () => useAppStore((state) => state.totalUnread);
export const useIsMessagesLoaded = () => useAppStore((state) => state.isMessagesLoaded);

// Thread messages selector (for specific thread)
// Use stable empty array to prevent unnecessary re-renders
const EMPTY_MESSAGES: never[] = [];
export const useThreadMessages = (threadId: string) =>
  useAppStore((state) => state.threadMessages[threadId] ?? EMPTY_MESSAGES);

// Coins selectors
export const useCoins = () => useAppStore((state) => state.coins);
export const useMetFriendIds = () => useAppStore((state) => state.metFriendIds);

// Loading selectors
export const useIsPreloading = () => useAppStore((state) => state.isPreloading);
export const usePreloadError = () => useAppStore((state) => state.preloadError);
export const useMapReady = () => useAppStore((state) => state.mapReady);

// Presence selectors
export const useOnlineUsers = () => useAppStore((state) => state.onlineUsers);

// Check if all data is loaded
export const useIsFullyLoaded = () =>
  useAppStore(
    (state) =>
      state.isProfileLoaded && state.isFriendsLoaded && state.isMessagesLoaded
  );

// Location selectors
export const useUserLocation = () => useAppStore((state) => state.userLocation);
export const useNearbyUsers = () => useAppStore((state) => state.nearbyUsers);
export const useVisibleUsers = () => useAppStore((state) => state.visibleUsers);
export const useSelectedClusterUserIds = () => useAppStore((state) => state.selectedClusterUserIds);
export const useHighlightedUserId = () => useAppStore((state) => state.highlightedUserId);
export const usePendingUserId = () => useAppStore((state) => state.pendingUserId);
export const useHighlightedData = () => useAppStore((state) => state.highlightedData);

