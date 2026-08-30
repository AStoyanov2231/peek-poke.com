import {
  locationAcknowledgementIsFresh,
  type LocationUpdateResponse,
} from "@peekpoke/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { Coordinates } from "./api";

export const LOCATION_SYNC_DEADLINE_MS = 30_000;

export type LocationSyncPhase = "coordinates" | "sync";
export type LocationSyncOutcome = "success" | "failure" | "superseded";

export type DiscoveryLocationState = {
  coords: Coordinates | null;
  freshForUserId: string | null;
  acknowledgedAt: number | null;
  status: "idle" | "prompting" | "granted" | "denied" | "error";
};

export function locationIsFreshForDiscovery(
  location: DiscoveryLocationState,
  userId: string | null | undefined,
  now = Date.now(),
) {
  return Boolean(
    userId &&
    location.coords &&
    location.status === "granted" &&
    location.freshForUserId === userId &&
    locationAcknowledgementIsFresh(location.acknowledgedAt, now),
  );
}

export function locationFailureRequiresRecovery(
  phase: LocationSyncPhase,
  hasRetainedCoordinates: boolean,
) {
  return phase === "sync" || hasRetainedCoordinates;
}

type AttemptToken = {
  id: number;
  userId: string;
};

type ActiveAttempt = {
  controller: AbortController;
  deadline: ReturnType<typeof setTimeout>;
  token: AttemptToken;
};

export class LocationSyncDeadlineError extends Error {
  constructor() {
    super("Location sync timed out");
    this.name = "LocationSyncDeadlineError";
  }
}

export function refetchNearbyAfterLocationSync(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({
    queryKey: ["discovery", "nearby", userId],
    refetchType: "active",
  });
}

function supersededError() {
  const error = new Error("Location sync superseded");
  error.name = "AbortError";
  return error;
}

export function createLocationSyncCoordinator(
  deadlineMs = LOCATION_SYNC_DEADLINE_MS,
) {
  let sequence = 0;
  let active: ActiveAttempt | null = null;

  const cancel = () => {
    const previous = active;
    active = null;
    if (!previous) return;
    clearTimeout(previous.deadline);
    previous.controller.abort(supersededError());
  };

  return {
    begin(userId: string) {
      cancel();
      const controller = new AbortController();
      const token = { id: ++sequence, userId };
      const deadline = setTimeout(() => {
        controller.abort(new LocationSyncDeadlineError());
      }, deadlineMs);
      active = { controller, deadline, token };
      return { signal: controller.signal, token };
    },
    cancel,
    finish(token: AttemptToken) {
      if (active?.token !== token) return;
      clearTimeout(active.deadline);
      active = null;
    },
    isCurrent(token: AttemptToken) {
      return active?.token === token;
    },
  };
}

export async function runLocationSyncAttempt({
  coordinator,
  userId,
  resolveCoordinates,
  sync,
  onFailure,
  onPending,
  onSuccess,
}: {
  coordinator: ReturnType<typeof createLocationSyncCoordinator>;
  userId: string;
  resolveCoordinates: (signal: AbortSignal) => Promise<Coordinates>;
  sync: (coords: Coordinates, signal: AbortSignal) => Promise<LocationUpdateResponse>;
  onFailure: (error: unknown, phase: LocationSyncPhase) => void;
  onPending: (pending: boolean) => void;
  onSuccess: (coords: Coordinates) => void;
}): Promise<LocationSyncOutcome> {
  const attempt = coordinator.begin(userId);
  let phase: LocationSyncPhase = "coordinates";
  onPending(true);

  try {
    const coords = await resolveCoordinates(attempt.signal);
    if (!coordinator.isCurrent(attempt.token) || attempt.signal.aborted) {
      return "superseded";
    }
    phase = "sync";
    const acknowledgement = await sync(coords, attempt.signal);
    if (!coordinator.isCurrent(attempt.token)) return "superseded";
    if (acknowledgement.ok !== true) {
      throw new Error("Invalid location acknowledgement");
    }
    onSuccess(coords);
    return "success";
  } catch (error) {
    if (!coordinator.isCurrent(attempt.token)) return "superseded";
    onFailure(error, phase);
    return "failure";
  } finally {
    if (coordinator.isCurrent(attempt.token)) {
      onPending(false);
      coordinator.finish(attempt.token);
    }
  }
}
