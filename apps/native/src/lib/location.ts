import * as Location from "expo-location";
import * as Device from "expo-device";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import {
  LOCATION_ACK_FRESHNESS_TTL_MS,
  locationAcknowledgementIsFresh,
  locationAcknowledgementTimerDelay,
} from "@peekpoke/shared";
import type { Coordinates } from "@/data/discovery/api";
import { isAbortError } from "@/data/discovery/policy";

const DEV_EMULATOR_LOCATION = { lat: 42.6977, lng: 23.3219 };
const LOCATION_TIMEOUT_MS = 5_000;

export type DeviceLocationState = {
  coords: Coordinates | null;
  status: "idle" | "prompting" | "granted" | "denied" | "error";
  error: string | null;
  failureForUserId: string | null;
  freshForUserId: string | null;
  acknowledgedAt: number | null;
};

let deviceLocationState: DeviceLocationState = {
  coords: null,
  status: "idle",
  error: null,
  failureForUserId: null,
  freshForUserId: null,
  acknowledgedAt: null,
};
const listeners = new Set<() => void>();
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

function scheduleLocationFreshnessExpiry(
  lease: {
    acknowledgedAt: number;
    canRecheck: boolean;
    generation: number;
    monotonicDeadline: number;
    userId: string;
  },
  delay: number,
) {
  locationFreshnessTimer = setTimeout(() => {
    locationFreshnessTimer = null;
    if (
      lease.generation !== locationFreshnessGeneration ||
      deviceLocationState.freshForUserId !== lease.userId ||
      deviceLocationState.acknowledgedAt !== lease.acknowledgedAt
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
    markDeviceLocationStale(lease.userId, "Location needs to be refreshed.");
  }, delay);
}

function setDeviceLocationState(next: DeviceLocationState) {
  deviceLocationState = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeviceLocation() {
  return useSyncExternalStore(subscribe, () => deviceLocationState, () => deviceLocationState);
}

export function getDeviceLocationSnapshot() {
  return deviceLocationState;
}

export function resetDeviceLocation() {
  invalidateLocationFreshnessTimer();
  setDeviceLocationState({
    coords: null,
    status: "idle",
    error: null,
    failureForUserId: null,
    freshForUserId: null,
    acknowledgedAt: null,
  });
}

export function markDeviceLocationSynced(
  userId: string,
  coords: Coordinates,
  acknowledgedAt = Date.now(),
) {
  if (
    deviceLocationState.status !== "granted" ||
    deviceLocationState.coords?.lat !== coords.lat ||
    deviceLocationState.coords.lng !== coords.lng
  ) {
    return false;
  }

  invalidateLocationFreshnessTimer();
  const lease = {
    acknowledgedAt,
    canRecheck: true,
    generation: locationFreshnessGeneration,
    monotonicDeadline: monotonicNow() + LOCATION_ACK_FRESHNESS_TTL_MS,
    userId,
  };
  setDeviceLocationState({
    ...deviceLocationState,
    status: "granted",
    error: null,
    failureForUserId: null,
    freshForUserId: userId,
    acknowledgedAt,
  });
  scheduleLocationFreshnessExpiry(lease, LOCATION_ACK_FRESHNESS_TTL_MS);
  return true;
}

export function markDeviceLocationStale(userId: string, message: string) {
  if (!deviceLocationState.coords) return false;
  invalidateLocationFreshnessTimer();
  setDeviceLocationState({
    ...deviceLocationState,
    status: "error",
    error: message,
    failureForUserId: userId,
    freshForUserId: null,
    acknowledgedAt: null,
  });
  return true;
}

export function clearDeviceLocationFreshness() {
  invalidateLocationFreshnessTimer();
  setDeviceLocationState({
    ...deviceLocationState,
    freshForUserId: null,
    acknowledgedAt: null,
  });
}

export function expireDeviceLocationIfNeeded(now = Date.now()) {
  if (!deviceLocationState.coords || !deviceLocationState.freshForUserId) return false;
  if (locationAcknowledgementIsFresh(deviceLocationState.acknowledgedAt, now)) return false;
  markDeviceLocationStale(
    deviceLocationState.freshForUserId,
    "Location needs to be refreshed.",
  );
  return true;
}

async function getAndroidEmulatorLocation() {
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 60 * 60 * 1000,
    requiredAccuracy: 1_000,
  });

  if (lastKnown) return lastKnown;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Location request timed out.")), LOCATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function refreshDeviceLocation(signal?: AbortSignal) {
  if (!deviceLocationState.coords) {
    setDeviceLocationState({ ...deviceLocationState, status: "prompting", error: null });
  }

  try {
    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission = existingPermission.canAskAgain && existingPermission.status !== "granted"
      ? await Location.requestForegroundPermissionsAsync()
      : existingPermission;
    signal?.throwIfAborted();

    if (permission.status !== "granted") {
      const error = new Error("Location permission is required to show nearby people.");
      invalidateLocationFreshnessTimer();
      setDeviceLocationState({
        coords: null,
        status: "denied",
        error: error.message,
        failureForUserId: null,
        freshForUserId: null,
        acknowledgedAt: null,
      });
      throw error;
    }

    let current: Location.LocationObject;
    try {
      current = __DEV__ && Platform.OS === "android" && !Device.isDevice
        ? await getAndroidEmulatorLocation()
        : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch (error) {
      if (!(__DEV__ && Platform.OS === "android" && !Device.isDevice)) throw error;

      current = {
        coords: {
          latitude: DEV_EMULATOR_LOCATION.lat,
          longitude: DEV_EMULATOR_LOCATION.lng,
          altitude: null,
          accuracy: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
    }
    signal?.throwIfAborted();

    const coords = { lat: current.coords.latitude, lng: current.coords.longitude };
    invalidateLocationFreshnessTimer();
    setDeviceLocationState({
      coords,
      status: "granted",
      error: deviceLocationState.error,
      failureForUserId: deviceLocationState.failureForUserId,
      freshForUserId: null,
      acknowledgedAt: null,
    });
    return coords;
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (deviceLocationState.status === "denied") throw error;

    const message = error instanceof Error ? error.message : "Could not load your location.";
    invalidateLocationFreshnessTimer();
    setDeviceLocationState({
      ...deviceLocationState,
      status: "error",
      error: message,
      freshForUserId: null,
      acknowledgedAt: null,
    });
    throw error;
  }
}
