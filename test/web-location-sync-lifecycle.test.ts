import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_ACK_FRESHNESS_TTL_MS,
  LOCATION_ACK_TIMER_MAX_RECHECK_MS,
  locationAcknowledgementTimerDelay,
} from "@peekpoke/shared";
import {
  createWebLocationSyncCoordinator,
  discardUnsafeWebLocationCaches,
  locationIsFreshForViewer,
  runWebLocationSyncAttempt,
  WebLocationSyncDeadlineError,
  type WebLocationSyncPhase,
} from "@/features/map/location-sync";
import { shouldDetectWebMeetings } from "@/features/map/useMeetingDetection";
import { webQueryKeys } from "@/data/web-query";
import { useAppStore } from "@/stores/appStore";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const COORDS = { lat: 42.698, lng: 23.322 };
const NEXT_COORDS = { lat: 42.699, lng: 23.323 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function storeLocationSnapshot() {
  const state = useAppStore.getState();
  return {
    userLocation: state.userLocation,
    locationStatus: state.locationStatus,
    locationFreshForUserId: state.locationFreshForUserId,
    locationAcknowledgedAt: state.locationAcknowledgedAt,
  };
}

afterEach(() => {
  useAppStore.getState().clearStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("web location sync lifecycle", () => {
  it("keeps first-load nearby and meetings gated until the server acknowledgement commits", () => {
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);

    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
    expect(shouldDetectWebMeetings({
      hasFreshLocation: false,
      hasUser: true,
      hasLocation: true,
      friendCount: 1,
      nearbyCount: 1,
    })).toBe(false);

    expect(useAppStore.getState().markLocationSynced(USER_A, COORDS)).toBe(true);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(true);
  });

  it("retains safe coordinates but marks discovery stale after GPS or server failure", () => {
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);
    store.setDeviceLocationError(USER_A, "offline");

    expect(useAppStore.getState()).toMatchObject({
      userLocation: COORDS,
      locationStatus: "error",
      locationError: "offline",
      locationFailureForUserId: USER_A,
      locationFreshForUserId: null,
    });
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
  });

  it("expires globally at the client TTL even after map and chat consumers unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    expect(store.markLocationSynced(USER_A, COORDS)).toBe(true);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS - 1);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(useAppStore.getState()).toMatchObject({
      userLocation: COORDS,
      locationStatus: "error",
      locationError: "Location needs to be refreshed.",
      locationFailureForUserId: USER_A,
      locationFreshForUserId: null,
      locationAcknowledgedAt: null,
    });
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
  });

  it("expires when the wall clock rolls backward before the original timer fires", async () => {
    vi.useFakeTimers();
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);

    vi.setSystemTime(acknowledgedAt - LOCATION_ACK_FRESHNESS_TTL_MS / 2);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);

    expect(useAppStore.getState()).toMatchObject({
      locationStatus: "error",
      locationFailureForUserId: USER_A,
      locationFreshForUserId: null,
      locationAcknowledgedAt: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires immediately after a forward wall-clock jump and cancels the lease timer", () => {
    vi.useFakeTimers();
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);

    expect(store.expireLocationIfNeeded(
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS + 1,
    )).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires from one late callback after suspension without a retry loop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS * 3);

    expect(useAppStore.getState().locationFreshForUserId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds an early timer recheck and forces expiry on the next callback", () => {
    const acknowledgedAt = 1_000_000;
    const firstDelay = locationAcknowledgementTimerDelay({
      acknowledgedAt,
      canRecheck: true,
      monotonicDeadline: 50_000,
      monotonicNow: 49_500,
      now: acknowledgedAt + 10_000,
    });
    expect(firstDelay).toBe(500);
    expect(firstDelay).toBeLessThanOrEqual(LOCATION_ACK_TIMER_MAX_RECHECK_MS);
    expect(locationAcknowledgementTimerDelay({
      acknowledgedAt,
      canRecheck: false,
      monotonicDeadline: 50_000,
      monotonicNow: 49_500,
      now: acknowledgedAt + 10_000,
    })).toBeNull();
  });

  it("runs the bounded recheck path once when both clocks report an early callback", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockReturnValue(0);
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);

    vi.setSystemTime(acknowledgedAt - LOCATION_ACK_FRESHNESS_TTL_MS / 2);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);
    expect(useAppStore.getState().locationFreshForUserId).toBe(USER_A);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_TIMER_MAX_RECHECK_MS);
    expect(useAppStore.getState().locationFreshForUserId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the old generation timer when another account is acknowledged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);
    expect(vi.getTimerCount()).toBe(1);

    store.markLocationSynced(USER_B, COORDS);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);

    expect(useAppStore.getState()).toMatchObject({
      locationFailureForUserId: USER_B,
      locationFreshForUserId: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the lease on cleanup without a delayed stale commit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);
    store.markLocationStale();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS * 2);
    expect(useAppStore.getState()).toMatchObject({
      locationError: null,
      locationFailureForUserId: null,
      locationFreshForUserId: null,
    });
  });

  it("never reuses an acknowledgement across an A to B to A account transition", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.markLocationSynced(USER_A, COORDS);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(true);

    store.markLocationStale();
    store.markLocationSynced(USER_B, COORDS);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_B)).toBe(true);

    store.markLocationStale();
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
  });

  it("rejects an invalid acknowledgement without a fresh-location commit", async () => {
    const failures: WebLocationSyncPhase[] = [];
    const success = vi.fn();

    await expect(runWebLocationSyncAttempt({
      coordinator: createWebLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => ({ ok: false }) as never,
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: (_error, phase) => failures.push(phase),
      onPending: () => undefined,
      onSuccess: success,
    })).resolves.toBe("failure");

    expect(failures).toEqual(["sync"]);
    expect(success).not.toHaveBeenCalled();
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
  });

  it("reacquires coordinates and clears stale state only after exact retry acknowledgement", async () => {
    const store = useAppStore.getState();
    store.setDeviceLocation(COORDS);
    store.setDeviceLocationError(USER_A, "GPS unavailable");

    await expect(runWebLocationSyncAttempt({
      coordinator: createWebLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => NEXT_COORDS,
      sync: async () => ({ ok: true }),
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: (coordinates) => {
        useAppStore.getState().markLocationSynced(USER_A, coordinates);
      },
    })).resolves.toBe("success");

    expect(useAppStore.getState()).toMatchObject({
      userLocation: NEXT_COORDS,
      locationStatus: "granted",
      locationError: null,
      locationFailureForUserId: null,
      locationFreshForUserId: USER_A,
    });
  });

  it("allows only the newest account generation to become fresh", async () => {
    const coordinator = createWebLocationSyncCoordinator();
    const oldAcknowledgement = deferred<{ ok: true }>();
    const first = runWebLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => oldAcknowledgement.promise,
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: (coordinates) => {
        useAppStore.getState().markLocationSynced(USER_A, coordinates);
      },
    });
    await Promise.resolve();

    await expect(runWebLocationSyncAttempt({
      coordinator,
      userId: USER_B,
      resolveCoordinates: async () => NEXT_COORDS,
      sync: async () => ({ ok: true }),
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: (coordinates) => {
        useAppStore.getState().markLocationSynced(USER_B, coordinates);
      },
    })).resolves.toBe("success");
    oldAcknowledgement.resolve({ ok: true });
    await expect(first).resolves.toBe("superseded");

    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_A)).toBe(false);
    expect(locationIsFreshForViewer(storeLocationSnapshot(), USER_B)).toBe(true);
  });

  it("cancels coordinate acquisition without committing a stale callback", async () => {
    const coordinator = createWebLocationSyncCoordinator();
    const success = vi.fn();
    const attempt = runWebLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      sync: async () => ({ ok: true }),
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: success,
    });

    coordinator.cancel();
    await expect(attempt).resolves.toBe("superseded");
    expect(success).not.toHaveBeenCalled();
  });

  it("turns the bounded total deadline into a handled sync failure", async () => {
    vi.useFakeTimers();
    const failures: Array<{ error: unknown; phase: WebLocationSyncPhase }> = [];
    const attempt = runWebLocationSyncAttempt({
      coordinator: createWebLocationSyncCoordinator(25),
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: (_coordinates, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      onCoordinates: useAppStore.getState().setDeviceLocation,
      onFailure: (error, phase) => failures.push({ error, phase }),
      onPending: () => undefined,
      onSuccess: () => undefined,
    });

    await vi.advanceTimersByTimeAsync(26);
    await expect(attempt).resolves.toBe("failure");
    expect(failures[0]).toMatchObject({
      error: expect.any(WebLocationSyncDeadlineError),
      phase: "sync",
    });
  });

  it("cancels and removes unsafe nearby and viewer-scoped bot caches", async () => {
    const client = new QueryClient();
    client.setQueryData(webQueryKeys.nearby(USER_A, COORDS.lat, COORDS.lng), ["unsafe"]);
    client.setQueryData(webQueryKeys.bots(USER_A, COORDS.lat, COORDS.lng), ["unsafe"]);
    client.setQueryData(webQueryKeys.bots(USER_B, COORDS.lat, COORDS.lng), ["other-account"]);

    await expect(discardUnsafeWebLocationCaches(client)).resolves.toBe(true);

    expect(client.getQueriesData({ queryKey: ["web", "nearby"] })).toEqual([]);
    expect(client.getQueriesData({ queryKey: ["web", "bots"] })).toEqual([]);
    expect(webQueryKeys.bots(USER_A, COORDS.lat, COORDS.lng))
      .not.toEqual(webQueryKeys.bots(USER_B, COORDS.lat, COORDS.lng));
  });
});
