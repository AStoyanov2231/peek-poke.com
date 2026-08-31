import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { LOCATION_ACK_FRESHNESS_TTL_MS } from "@peekpoke/shared";
import {
  createLocationSyncCoordinator,
  LocationSyncDeadlineError,
  locationFailureRequiresRecovery,
  locationIsFreshForDiscovery,
  refetchNearbyAfterLocationSync,
  runLocationSyncAttempt,
  type LocationSyncPhase,
} from "@/data/discovery/location-sync";
import { shouldDetectMeetings } from "@/data/discovery/meeting";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const COORDS = { lat: 42.698, lng: 23.322 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function callbacks() {
  return {
    failures: [] as Array<{ error: unknown; phase: LocationSyncPhase }>,
    pending: [] as boolean[],
    successes: [] as typeof COORDS[],
  };
}

describe("location sync lifecycle", () => {
  it("persists a sync failure and never emits success without an exact acknowledgement", async () => {
    const events = callbacks();
    const failure = new Error("network unavailable");

    const outcome = await runLocationSyncAttempt({
      coordinator: createLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => { throw failure; },
      onFailure: (error, phase) => events.failures.push({ error, phase }),
      onPending: (pending) => events.pending.push(pending),
      onSuccess: (coords) => events.successes.push(coords),
    });

    expect(outcome).toBe("failure");
    expect(events.failures).toEqual([{ error: failure, phase: "sync" }]);
    expect(events.successes).toEqual([]);
    expect(events.pending).toEqual([true, false]);
  });

  it("rejects a malformed acknowledgement before the success commit", async () => {
    const events = callbacks();

    const outcome = await runLocationSyncAttempt({
      coordinator: createLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => ({ ok: false }) as never,
      onFailure: (error, phase) => events.failures.push({ error, phase }),
      onPending: (pending) => events.pending.push(pending),
      onSuccess: (coords) => events.successes.push(coords),
    });

    expect(outcome).toBe("failure");
    expect(events.failures).toHaveLength(1);
    expect(events.failures[0]?.phase).toBe("sync");
    expect(events.successes).toEqual([]);
  });

  it("allows only the newest attempt and account to commit", async () => {
    const coordinator = createLocationSyncCoordinator();
    const oldAcknowledgement = deferred<{ ok: true }>();
    const successes: string[] = [];
    const failures: string[] = [];
    const oldAttempt = runLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => oldAcknowledgement.promise,
      onFailure: () => failures.push(USER_A),
      onPending: () => undefined,
      onSuccess: () => successes.push(USER_A),
    });
    await Promise.resolve();

    const newAttempt = runLocationSyncAttempt({
      coordinator,
      userId: USER_B,
      resolveCoordinates: async () => COORDS,
      sync: async () => ({ ok: true }),
      onFailure: () => failures.push(USER_B),
      onPending: () => undefined,
      onSuccess: () => successes.push(USER_B),
    });

    await expect(newAttempt).resolves.toBe("success");
    oldAcknowledgement.resolve({ ok: true });
    await expect(oldAttempt).resolves.toBe("superseded");
    expect(successes).toEqual([USER_B]);
    expect(failures).toEqual([]);
  });

  it("does not start sync after an obsolete coordinate resolver completes", async () => {
    const coordinator = createLocationSyncCoordinator();
    const oldCoordinates = deferred<typeof COORDS>();
    const oldSync = vi.fn(async () => ({ ok: true as const }));
    const oldAttempt = runLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: async () => oldCoordinates.promise,
      sync: oldSync,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: () => undefined,
    });
    await Promise.resolve();

    await expect(runLocationSyncAttempt({
      coordinator,
      userId: USER_B,
      resolveCoordinates: async () => COORDS,
      sync: async () => ({ ok: true }),
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: () => undefined,
    })).resolves.toBe("success");

    oldCoordinates.resolve(COORDS);
    await expect(oldAttempt).resolves.toBe("superseded");
    expect(oldSync).not.toHaveBeenCalled();
  });

  it("turns the total deadline into a handled sync failure", async () => {
    vi.useFakeTimers();
    const coordinator = createLocationSyncCoordinator(25);
    const events = callbacks();
    const attempt = runLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: (_coords, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      onFailure: (error, phase) => events.failures.push({ error, phase }),
      onPending: (pending) => events.pending.push(pending),
      onSuccess: (coords) => events.successes.push(coords),
    });

    await vi.advanceTimersByTimeAsync(26);
    await expect(attempt).resolves.toBe("failure");
    expect(events.failures[0]).toMatchObject({
      error: expect.any(LocationSyncDeadlineError),
      phase: "sync",
    });
    expect(events.successes).toEqual([]);
    vi.useRealTimers();
  });

  it("classifies coordinate acquisition separately from server sync", async () => {
    const events = callbacks();
    const coordinateError = new Error("GPS unavailable");
    const sync = vi.fn();

    await expect(runLocationSyncAttempt({
      coordinator: createLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => { throw coordinateError; },
      sync,
      onFailure: (error, phase) => events.failures.push({ error, phase }),
      onPending: (pending) => events.pending.push(pending),
      onSuccess: (coords) => events.successes.push(coords),
    })).resolves.toBe("failure");

    expect(events.failures).toEqual([{ error: coordinateError, phase: "coordinates" }]);
    expect(sync).not.toHaveBeenCalled();
  });

  it("keeps retained coordinates stale and recoverable after coordinate acquisition fails", async () => {
    const retainedLocation = {
      coords: COORDS,
      freshForUserId: null,
      acknowledgedAt: null,
      status: "error" as const,
    };

    expect(locationFailureRequiresRecovery("coordinates", true)).toBe(true);
    expect(locationIsFreshForDiscovery(retainedLocation, USER_A)).toBe(false);
    expect(shouldDetectMeetings({
      active: true,
      hasFreshLocation: false,
      hasProfile: true,
      friendCount: 1,
      nearbyCount: 1,
    })).toBe(false);
  });

  it("restores discovery and meeting eligibility only after fresh coordinates receive an exact acknowledgement", async () => {
    let locationState = {
      coords: COORDS,
      freshForUserId: null as string | null,
      acknowledgedAt: null as number | null,
      status: "error" as "error" | "granted",
    };
    const freshCoords = { lat: 42.699, lng: 23.323 };

    const outcome = await runLocationSyncAttempt({
      coordinator: createLocationSyncCoordinator(),
      userId: USER_A,
      resolveCoordinates: async () => freshCoords,
      sync: async () => ({ ok: true }),
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: (coords) => {
        locationState = {
          coords,
          freshForUserId: USER_A,
          acknowledgedAt: Date.now(),
          status: "granted",
        };
      },
    });

    expect(outcome).toBe("success");
    expect(locationIsFreshForDiscovery(locationState, USER_A)).toBe(true);
    expect(shouldDetectMeetings({
      active: true,
      hasFreshLocation: true,
      hasProfile: true,
      friendCount: 1,
      nearbyCount: 1,
    })).toBe(true);
  });

  it("does not treat another or superseded account's acknowledged coordinates as fresh", async () => {
    const coordinator = createLocationSyncCoordinator();
    const oldAcknowledgement = deferred<{ ok: true }>();
    let freshForUserId: string | null = null;
    const first = runLocationSyncAttempt({
      coordinator,
      userId: USER_A,
      resolveCoordinates: async () => COORDS,
      sync: async () => oldAcknowledgement.promise,
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: () => { freshForUserId = USER_A; },
    });
    await Promise.resolve();

    await expect(runLocationSyncAttempt({
      coordinator,
      userId: USER_B,
      resolveCoordinates: async () => COORDS,
      sync: async () => ({ ok: true }),
      onFailure: () => undefined,
      onPending: () => undefined,
      onSuccess: () => { freshForUserId = USER_B; },
    })).resolves.toBe("success");
    oldAcknowledgement.resolve({ ok: true });
    await expect(first).resolves.toBe("superseded");

    const locationState = {
      coords: COORDS,
      freshForUserId,
      acknowledgedAt: Date.now(),
      status: "granted" as const,
    };
    expect(locationIsFreshForDiscovery(locationState, USER_A)).toBe(false);
    expect(locationIsFreshForDiscovery(locationState, USER_B)).toBe(true);
  });

  it("treats an acknowledgement as fresh before the TTL and stale at the exact boundary", () => {
    const acknowledgedAt = Date.parse("2026-08-07T12:00:00.000Z");
    const locationState = {
      coords: COORDS,
      freshForUserId: USER_A,
      acknowledgedAt,
      status: "granted" as const,
    };

    expect(locationIsFreshForDiscovery(
      locationState,
      USER_A,
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS - 1,
    )).toBe(true);
    expect(locationIsFreshForDiscovery(
      locationState,
      USER_A,
      acknowledgedAt + LOCATION_ACK_FRESHNESS_TTL_MS,
    )).toBe(false);
  });

  it("never reuses the previous account's acknowledgement after A to B to A", () => {
    const now = Date.parse("2026-08-07T12:00:00.000Z");
    const accountBState = {
      coords: COORDS,
      freshForUserId: USER_B,
      acknowledgedAt: now,
      status: "granted" as const,
    };
    const clearedState = {
      ...accountBState,
      freshForUserId: null,
      acknowledgedAt: null,
    };

    expect(locationIsFreshForDiscovery(accountBState, USER_A, now)).toBe(false);
    expect(locationIsFreshForDiscovery(accountBState, USER_B, now)).toBe(true);
    expect(locationIsFreshForDiscovery(clearedState, USER_A, now)).toBe(false);
  });

  it("marks only the acknowledged viewer's nearby cache stale and refetches active observers", async () => {
    const invalidateQueries = vi.fn(async () => undefined);

    await refetchNearbyAfterLocationSync(
      { invalidateQueries } as unknown as QueryClient,
      USER_A,
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["discovery", "nearby", USER_A],
      refetchType: "active",
    });
  });
});
