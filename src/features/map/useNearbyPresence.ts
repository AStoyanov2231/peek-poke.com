"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { safeQueryRetryDelay, shouldRetrySafeQuery } from "@peekpoke/shared";
import { useAppStore } from "@/stores/appStore";
import { TRACK_DEBOUNCE_MS } from "@/lib/constants";
import {
  nearbyQueryOptions,
  updateWebLocation,
  webQueryKeys,
} from "@/data/web-query";
import {
  createWebLocationSyncCoordinator,
  locationIsFreshForViewer,
  requestCurrentWebLocation,
  runWebLocationSyncAttempt,
  type WebCoordinates,
} from "@/features/map/location-sync";
import { useGeolocation } from "@/features/map/useGeolocation";

export type WebLocationPresence = {
  isLocationFresh: boolean;
  isLocationSyncError: boolean;
  isLocationSyncPending: boolean;
  retryLocationSync: () => void;
};

const WebLocationPresenceContext = createContext<WebLocationPresence | null>(null);

function locationFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not recover your location.";
}

export function useNearbyPresence(userId: string | undefined) {
  const queryClient = useQueryClient();
  const userLocation = useAppStore((state) => state.userLocation);
  const locationStatus = useAppStore((state) => state.locationStatus);
  const locationError = useAppStore((state) => state.locationError);
  const locationFailureForUserId = useAppStore((state) => state.locationFailureForUserId);
  const locationFreshForUserId = useAppStore((state) => state.locationFreshForUserId);
  const locationAcknowledgedAt = useAppStore((state) => state.locationAcknowledgedAt);
  const setUserLocation = useAppStore((state) => state.setUserLocation);
  const setDeviceLocation = useAppStore((state) => state.setDeviceLocation);
  const setDeviceLocationError = useAppStore((state) => state.setDeviceLocationError);
  const markLocationSynced = useAppStore((state) => state.markLocationSynced);
  const locationFresh = locationIsFreshForViewer({
    userLocation,
    locationStatus,
    locationFreshForUserId,
    locationAcknowledgedAt,
  }, userId);
  const [coordinator] = useState(createWebLocationSyncCoordinator);
  const [pendingForUserId, setPendingForUserId] = useState<string | null>(null);
  const lastTrackRef = useRef(0);
  const lastUserRef = useRef<string | undefined>(userId);

  useQuery({
    ...nearbyQueryOptions(userLocation, userId),
    enabled: locationFresh,
  });

  // Cache invalidation is deferred until the exact acknowledgement is validated
  // and the account-bound coordinator confirms this attempt is still current.
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  const locationMutation = useMutation({
    mutationFn: ({ coordinates, signal }: {
      coordinates: WebCoordinates;
      signal: AbortSignal;
    }) => updateWebLocation(coordinates, signal),
    retry: shouldRetrySafeQuery,
    retryDelay: safeQueryRetryDelay,
  });
  const mutateLocation = locationMutation.mutateAsync;

  const runLocationSync = useCallback((
    resolveCoordinates: (signal: AbortSignal) => Promise<WebCoordinates>,
  ) => {
    if (!userId) return Promise.resolve("superseded" as const);
    const attemptUserId = userId;
    return runWebLocationSyncAttempt({
      coordinator,
      userId: attemptUserId,
      resolveCoordinates,
      sync: (coordinates, signal) => mutateLocation({ coordinates, signal }),
      onCoordinates: setDeviceLocation,
      onFailure: (error) => {
        setDeviceLocationError(attemptUserId, locationFailureMessage(error));
      },
      onPending: (pending) => {
        setPendingForUserId((current) => pending
          ? attemptUserId
          : current === attemptUserId ? null : current);
      },
      onSuccess: (coordinates) => {
        if (!markLocationSynced(attemptUserId, coordinates)) return;
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["web", "nearby", attemptUserId],
            refetchType: "active",
          }),
          queryClient.invalidateQueries({
            queryKey: ["web", "bots", attemptUserId],
            refetchType: "active",
          }),
        ]);
      },
    });
  }, [coordinator, markLocationSynced, mutateLocation, queryClient, setDeviceLocation, setDeviceLocationError, userId]);

  useEffect(() => {
    if (
      !userId ||
      !userLocation ||
      locationStatus !== "granted" ||
      locationFresh ||
      pendingForUserId === userId
    ) return;
    if (useAppStore.getState().userLocation !== userLocation) return;
    if (lastUserRef.current !== userId) {
      lastUserRef.current = userId;
      lastTrackRef.current = 0;
      setUserLocation(null);
      return;
    }

    const run = () => {
      lastTrackRef.current = Date.now();
      void runLocationSync(async () => userLocation);
    };
    const waitMs = Math.max(0, TRACK_DEBOUNCE_MS - (Date.now() - lastTrackRef.current));
    if (waitMs === 0) {
      run();
      return;
    }
    const timer = setTimeout(run, waitMs);
    return () => clearTimeout(timer);
  }, [locationFresh, locationStatus, pendingForUserId, runLocationSync, setUserLocation, userId, userLocation]);

  useEffect(() => () => coordinator.cancel(), [coordinator, userId]);

  const retryLocationSync = useCallback(() => {
    if (!userId) return;
    void runLocationSync(requestCurrentWebLocation);
  }, [runLocationSync, userId]);

  return {
    isLocationFresh: locationFresh,
    isLocationSyncError: Boolean(
      userLocation &&
      locationError &&
      locationFailureForUserId === userId,
    ),
    isLocationSyncPending: pendingForUserId === userId,
    retryLocationSync,
  };
}

export function WebLocationPresenceProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | undefined;
}) {
  useGeolocation(userId);
  const presence = useNearbyPresence(userId);
  return (
    <WebLocationPresenceContext.Provider value={presence}>
      {children}
    </WebLocationPresenceContext.Provider>
  );
}

export function useWebLocationPresence() {
  const presence = useContext(WebLocationPresenceContext);
  if (!presence) throw new Error("WebLocationPresenceProvider is missing");
  return presence;
}
