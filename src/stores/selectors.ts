"use client";
import { useAppStore } from "./appStore";
import { useShallow } from "zustand/react/shallow";
import type { RoleName } from "@/types/database";

// Profile selectors
export const useProfile = () => useAppStore((state) => state.profile);
export const usePhotos = () => useAppStore(useShallow((state) => state.photos));
export const useInterests = () => useAppStore(useShallow((state) => state.interests));
export const useAllTags = () => useAppStore(useShallow((state) => state.allTags));
export const useProfileStats = () => useAppStore((state) => state.stats);
export const useIsProfileLoaded = () => useAppStore((state) => state.isProfileLoaded);
export const useIsPremium = () =>
  useAppStore((state) => state.profile?.roles?.includes("subscriber") ?? false);
export const useHasRole = (roleName: RoleName) =>
  useAppStore((state) => state.profile?.roles?.includes(roleName) ?? false);

// Friends selectors
export const useFriends = () => useAppStore(useShallow((state) => state.friends));
export const useFriendRequests = () => useAppStore(useShallow((state) => state.requests));
export const useSentRequests = () => useAppStore(useShallow((state) => state.sentRequests));
export const useFriendRequestCount = () => useAppStore((state) => state.requests.length);
export const useIsFriendsLoaded = () => useAppStore((state) => state.isFriendsLoaded);

// Messages selectors
export const useThreads = () => useAppStore(useShallow((state) => state.threads));
export const useTotalUnread = () => useAppStore((state) => state.totalUnread);
export const useIsMessagesLoaded = () => useAppStore((state) => state.isMessagesLoaded);

// Thread messages selector (for specific thread)
// Use stable empty array to prevent unnecessary re-renders
const EMPTY_MESSAGES: never[] = [];
export const useThreadMessages = (threadId: string) =>
  useAppStore((state) => state.threadMessages[threadId] ?? EMPTY_MESSAGES);

// Coins selectors
export const useCoins = () => useAppStore((state) => state.coins);
export const useMetFriendIds = () => useAppStore(useShallow((state) => state.metFriendIds));

// Loading selectors
export const useIsPreloading = () => useAppStore((state) => state.isPreloading);
export const usePreloadError = () => useAppStore((state) => state.preloadError);
export const useMapReady = () => useAppStore((state) => state.mapReady);

// Presence selectors
export const useOnlineUsers = () => useAppStore(useShallow((state) => state.onlineUsers));

// Check if all data is loaded
export const useIsFullyLoaded = () =>
  useAppStore(
    (state) =>
      state.isProfileLoaded && state.isFriendsLoaded && state.isMessagesLoaded
  );

// Location selectors
export const useUserLocation = () => useAppStore((state) => state.userLocation);
export const useLocationStatus = () => useAppStore((state) => state.locationStatus);
export const useNearbyUsers = () => useAppStore(useShallow((state) => state.nearbyUsers));
export const useVisibleUsers = () => useAppStore(useShallow((state) => state.visibleUsers));
export const useSelectedClusterUserIds = () => useAppStore(useShallow((state) => state.selectedClusterUserIds));
export const useHighlightedUserId = () => useAppStore((state) => state.highlightedUserId);
export const usePendingUserId = () => useAppStore((state) => state.pendingUserId);
export const useHighlightedData = () => useAppStore((state) => state.highlightedData);
export const useBots = () => useAppStore(useShallow((state) => state.bots));
