"use client";

import { create } from "zustand";
import {
  LOCATION_ACK_FRESHNESS_TTL_MS,
  locationAcknowledgementIsFresh,
  locationAcknowledgementTimerDelay,
} from "@peekpoke/shared";
import { COIN_SPENT_ANIMATION_MS } from "@/lib/constants";
import type {
  DMThread,
  Friendship,
  NearbyUser,
  Profile,
} from "@/types/database";
import type { MapFilter } from "@/features/map/filters";

export type Bot = { id: string; lat: number; lng: number };

export type DMThreadWithParticipants = DMThread & {
  type: "dm";
  participant_1: Profile;
  participant_2: Profile;
  unread_count?: number;
};

export type Thread = DMThreadWithParticipants;
export type FriendshipWithRequester = Friendship & { requester: Profile };
export type FriendshipWithAddressee = Friendship & { addressee: Profile };
export type FriendWithFriendshipId = Profile & { friendship_id: string };

type LocationStatus = "idle" | "prompting" | "granted" | "denied" | "error";
type Coordinates = { lat: number; lng: number };

interface AppState {
  drafts: Record<string, string>;
  activeThreadId: string | null;
  mapReady: boolean;
  coinSpent: boolean;
  coinSpentCount: number;
  userLocation: Coordinates | null;
  locationStatus: LocationStatus;
  locationError: string | null;
  locationFailureForUserId: string | null;
  locationFreshForUserId: string | null;
  locationAcknowledgedAt: number | null;
  visibleUserIds: string[];
  selectedClusterUserIds: string[] | null;
  highlightedUserId: string | null;
  mapFilter: MapFilter;
  setDraft: (threadId: string, text: string) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setMapReady: (ready: boolean) => void;
  triggerCoinSpent: () => void;
  setUserLocation: (location: Coordinates | null) => void;
  setLocationStatus: (status: LocationStatus) => void;
  setDeviceLocation: (location: Coordinates) => void;
  setDeviceLocationError: (userId: string, message: string) => void;
  setLocationDenied: (userId: string) => void;
  markLocationStale: () => void;
  markLocationSynced: (userId: string, location: Coordinates) => boolean;
  expireLocationIfNeeded: (now?: number) => boolean;
  setVisibleUsers: (users: NearbyUser[]) => void;
  setSelectedClusterUserIds: (ids: string[] | null) => void;
  setHighlightedUserId: (id: string | null) => void;
  setMapFilter: (filter: MapFilter) => void;
  selectUser: (userId: string) => void;
  clearStore: () => void;
}

const initialState = {
  drafts: {},
  activeThreadId: null,
  mapReady: false,
  coinSpent: false,
  coinSpentCount: 0,
  userLocation: null,
  locationStatus: "idle" as const,
  locationError: null,
  locationFailureForUserId: null,
  locationFreshForUserId: null,
  locationAcknowledgedAt: null,
  visibleUserIds: [],
  selectedClusterUserIds: null,
  highlightedUserId: null,
  mapFilter: "all" as MapFilter,
};

let coinSpentTimer: ReturnType<typeof setTimeout> | null = null;
let locationFreshnessTimer: ReturnType<typeof setTimeout> | null = null;
let locationFreshnessGeneration = 0;

function invalidateLocationFreshnessTimer() {
  locationFreshnessGeneration += 1;
  if (locationFreshnessTimer) clearTimeout(locationFreshnessTimer);
  locationFreshnessTimer = null;
}

function monotonicNow() {
  return typeof performance !== "undefined" && Number.isFinite(performance.now())
    ? performance.now()
    : Date.now();
}

export const useAppStore = create<AppState>((set, get) => {
  const scheduleLocationFreshnessExpiry = (
    lease: {
      acknowledgedAt: number;
      canRecheck: boolean;
      generation: number;
      monotonicDeadline: number;
      userId: string;
    },
    delay: number,
  ) => {
    locationFreshnessTimer = setTimeout(() => {
      locationFreshnessTimer = null;
      const state = get();
      if (
        lease.generation !== locationFreshnessGeneration ||
        state.locationFreshForUserId !== lease.userId ||
        state.locationAcknowledgedAt !== lease.acknowledgedAt
      ) return;

      const recheckDelay = locationAcknowledgementTimerDelay({
        acknowledgedAt: lease.acknowledgedAt,
        canRecheck: lease.canRecheck,
        monotonicDeadline: lease.monotonicDeadline,
        monotonicNow: monotonicNow(),
        now: Date.now(),
      });
      if (recheckDelay !== null) {
        lease.canRecheck = false;
        scheduleLocationFreshnessExpiry(lease, recheckDelay);
        return;
      }

      invalidateLocationFreshnessTimer();
      set({
        locationStatus: "error",
        locationError: "Location needs to be refreshed.",
        locationFailureForUserId: lease.userId,
        locationFreshForUserId: null,
        locationAcknowledgedAt: null,
      });
    }, delay);
  };

  return {
    ...initialState,
  setDraft: (threadId, text) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (text) drafts[threadId] = text;
      else delete drafts[threadId];
      return { drafts };
    }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setMapReady: (mapReady) => set({ mapReady }),
  triggerCoinSpent: () => {
    if (coinSpentTimer) clearTimeout(coinSpentTimer);
    set((state) => ({
      coinSpent: true,
      coinSpentCount: state.coinSpentCount + 1,
    }));
    coinSpentTimer = setTimeout(() => {
      set({ coinSpent: false });
      coinSpentTimer = null;
    }, COIN_SPENT_ANIMATION_MS);
  },
  setUserLocation: (userLocation) => {
    invalidateLocationFreshnessTimer();
    set({ userLocation, locationFreshForUserId: null, locationAcknowledgedAt: null });
  },
  setLocationStatus: (locationStatus) => set({ locationStatus }),
  setDeviceLocation: (userLocation) => {
    invalidateLocationFreshnessTimer();
    set((state) => {
      if (
        state.userLocation?.lat === userLocation.lat &&
        state.userLocation.lng === userLocation.lng &&
        state.locationStatus === "granted" &&
        state.locationFreshForUserId === null
      ) {
        return state;
      }
      return {
        userLocation,
        locationStatus: "granted",
        locationError: state.locationError,
        locationFailureForUserId: state.locationFailureForUserId,
        locationFreshForUserId: null,
        locationAcknowledgedAt: null,
      };
    });
  },
  setDeviceLocationError: (locationFailureForUserId, locationError) => {
    invalidateLocationFreshnessTimer();
    set({
      locationStatus: "error",
      locationError,
      locationFailureForUserId,
      locationFreshForUserId: null,
      locationAcknowledgedAt: null,
    });
  },
  setLocationDenied: (locationFailureForUserId) => {
    invalidateLocationFreshnessTimer();
    set({
      userLocation: null,
      locationStatus: "denied",
      locationError: "Location permission is required to show nearby people.",
      locationFailureForUserId,
      locationFreshForUserId: null,
      locationAcknowledgedAt: null,
    });
  },
  markLocationStale: () => {
    invalidateLocationFreshnessTimer();
    set({ locationFreshForUserId: null, locationAcknowledgedAt: null });
  },
  markLocationSynced: (userId, location) => {
    const state = get();
    if (
      state.locationStatus !== "granted" ||
      state.userLocation?.lat !== location.lat ||
      state.userLocation.lng !== location.lng
    ) {
      return false;
    }
    const locationAcknowledgedAt = Date.now();
    invalidateLocationFreshnessTimer();
    const lease = {
      acknowledgedAt: locationAcknowledgedAt,
      canRecheck: true,
      generation: locationFreshnessGeneration,
      monotonicDeadline: monotonicNow() + LOCATION_ACK_FRESHNESS_TTL_MS,
      userId,
    };
    set({
      locationError: null,
      locationFailureForUserId: null,
      locationFreshForUserId: userId,
      locationAcknowledgedAt,
    });
    scheduleLocationFreshnessExpiry(lease, LOCATION_ACK_FRESHNESS_TTL_MS);
    return true;
  },
  expireLocationIfNeeded: (now = Date.now()) => {
    const state = get();
    if (!state.locationFreshForUserId || !state.userLocation) return false;
    if (locationAcknowledgementIsFresh(state.locationAcknowledgedAt, now)) return false;
    invalidateLocationFreshnessTimer();
    set({
      locationStatus: "error",
      locationError: "Location needs to be refreshed.",
      locationFailureForUserId: state.locationFreshForUserId,
      locationFreshForUserId: null,
      locationAcknowledgedAt: null,
    });
    return true;
  },
  setVisibleUsers: (visibleUsers) => set({
    visibleUserIds: visibleUsers.map((user) => user.userId),
  }),
  setSelectedClusterUserIds: (selectedClusterUserIds) => set({ selectedClusterUserIds }),
  setHighlightedUserId: (highlightedUserId) => set({ highlightedUserId }),
  setMapFilter: (mapFilter) => set({ mapFilter }),
  selectUser: (userId) => {
    if (get().highlightedUserId === userId) return;
    set({ highlightedUserId: userId });
  },
  clearStore: () => {
    if (coinSpentTimer) {
      clearTimeout(coinSpentTimer);
      coinSpentTimer = null;
    }
    invalidateLocationFreshnessTimer();
    set(initialState);
  },
  };
});
