import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_ACK_FRESHNESS_TTL_MS,
  LOCATION_ACK_TIMER_MAX_RECHECK_MS,
  locationAcknowledgementTimerDelay,
} from "@peekpoke/shared";

vi.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: vi.fn(async () => ({
    canAskAgain: false,
    status: "granted",
  })),
  getCurrentPositionAsync: vi.fn(async () => ({
    coords: { latitude: 42.698, longitude: 23.322 },
    timestamp: Date.now(),
  })),
  getLastKnownPositionAsync: vi.fn(async () => null),
  requestForegroundPermissionsAsync: vi.fn(),
}));

vi.mock("expo-device", () => ({ isDevice: true }));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  clearDeviceLocationFreshness,
  expireDeviceLocationIfNeeded,
  getDeviceLocationSnapshot,
  markDeviceLocationSynced,
  refreshDeviceLocation,
  resetDeviceLocation,
} from "@/lib/location";
import { locationIsFreshForDiscovery } from "@/data/discovery/location-sync";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const COORDS = { lat: 42.698, lng: 23.322 };

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
});

afterEach(() => {
  resetDeviceLocation();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("device location acknowledgement freshness", () => {
  it("stays fresh below the TTL and atomically expires while no route is mounted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    await refreshDeviceLocation();
    expect(markDeviceLocationSynced(USER_A, COORDS)).toBe(true);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS - 1);
    expect(locationIsFreshForDiscovery(getDeviceLocationSnapshot(), USER_A)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(getDeviceLocationSnapshot()).toMatchObject({
      coords: COORDS,
      status: "error",
      error: "Location needs to be refreshed.",
      failureForUserId: USER_A,
      freshForUserId: null,
      acknowledgedAt: null,
    });
  });

  it("foreground expiry is idempotent and cannot reuse an A to B to A acknowledgement", async () => {
    vi.useFakeTimers();
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS, acknowledgedAt);

    expect(expireDeviceLocationIfNeeded(
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS - 1,
    )).toBe(false);
    clearDeviceLocationFreshness();
    expect(locationIsFreshForDiscovery(getDeviceLocationSnapshot(), USER_A, acknowledgedAt)).toBe(false);

    markDeviceLocationSynced(USER_B, COORDS, acknowledgedAt);
    expect(locationIsFreshForDiscovery(getDeviceLocationSnapshot(), USER_A, acknowledgedAt)).toBe(false);
    expect(locationIsFreshForDiscovery(getDeviceLocationSnapshot(), USER_B, acknowledgedAt)).toBe(true);

    expect(expireDeviceLocationIfNeeded(
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS,
    )).toBe(true);
    expect(expireDeviceLocationIfNeeded(
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS,
    )).toBe(false);
    expect(locationIsFreshForDiscovery(getDeviceLocationSnapshot(), USER_A)).toBe(false);
  });

  it("expires when the wall clock rolls backward before the original timer fires", async () => {
    vi.useFakeTimers();
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);

    vi.setSystemTime(acknowledgedAt - LOCATION_ACK_FRESHNESS_TTL_MS / 2);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);

    expect(getDeviceLocationSnapshot()).toMatchObject({
      status: "error",
      failureForUserId: USER_A,
      freshForUserId: null,
      acknowledgedAt: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires immediately after a forward wall-clock jump and cancels the lease timer", async () => {
    vi.useFakeTimers();
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    vi.setSystemTime(acknowledgedAt);
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);

    expect(expireDeviceLocationIfNeeded(
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS + 1,
    )).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires from one late callback after suspension without a retry loop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS * 3);

    expect(getDeviceLocationSnapshot().freshForUserId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the bounded one-recheck decision with web", () => {
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
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);

    vi.setSystemTime(acknowledgedAt - LOCATION_ACK_FRESHNESS_TTL_MS / 2);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);
    expect(getDeviceLocationSnapshot().freshForUserId).toBe(USER_A);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(LOCATION_ACK_TIMER_MAX_RECHECK_MS);
    expect(getDeviceLocationSnapshot().freshForUserId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the old account generation timer before scheduling the new one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);
    expect(vi.getTimerCount()).toBe(1);

    markDeviceLocationSynced(USER_B, COORDS);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS);

    expect(getDeviceLocationSnapshot()).toMatchObject({
      failureForUserId: USER_B,
      freshForUserId: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the lease on cleanup without a delayed stale commit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    await refreshDeviceLocation();
    markDeviceLocationSynced(USER_A, COORDS);
    clearDeviceLocationFreshness();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LOCATION_ACK_FRESHNESS_TTL_MS * 2);
    expect(getDeviceLocationSnapshot()).toMatchObject({
      status: "granted",
      error: null,
      failureForUserId: null,
      freshForUserId: null,
    });
  });
});
