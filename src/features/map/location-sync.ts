import {
  locationAcknowledgementIsFresh,
  type LocationUpdateResponse,
} from "@peekpoke/shared";
import type { QueryClient } from "@tanstack/react-query";

export const WEB_LOCATION_SYNC_DEADLINE_MS = 30_000;

export type WebCoordinates = { lat: number; lng: number };
export type WebLocationSyncPhase = "coordinates" | "sync";
export type WebLocationSyncOutcome = "success" | "failure" | "superseded";

type AttemptToken = { id: number; userId: string };
type ActiveAttempt = {
  controller: AbortController;
  deadline: ReturnType<typeof setTimeout>;
  token: AttemptToken;
};

export class WebLocationSyncDeadlineError extends Error {
  constructor() {
    super("Location recovery timed out");
    this.name = "WebLocationSyncDeadlineError";
  }
}

function supersededError() {
  const error = new Error("Location recovery superseded");
  error.name = "AbortError";
  return error;
}

export function createWebLocationSyncCoordinator(
  deadlineMs = WEB_LOCATION_SYNC_DEADLINE_MS,
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
        controller.abort(new WebLocationSyncDeadlineError());
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

export function locationIsFreshForViewer(
  location: {
    userLocation: WebCoordinates | null;
    locationStatus: string;
    locationFreshForUserId: string | null;
    locationAcknowledgedAt: number | null;
  },
  userId: string | null | undefined,
  now = Date.now(),
) {
  return Boolean(
    userId &&
    location.userLocation &&
    location.locationStatus === "granted" &&
    location.locationFreshForUserId === userId &&
    locationAcknowledgementIsFresh(location.locationAcknowledgedAt, now),
  );
}

export async function discardUnsafeWebLocationCaches(
  queryClient: Pick<QueryClient, "cancelQueries" | "removeQueries">,
  isCurrent: () => boolean = () => true,
) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: ["web", "nearby"] }),
    queryClient.cancelQueries({ queryKey: ["web", "bots"] }),
  ]);
  if (!isCurrent()) return false;
  queryClient.removeQueries({ queryKey: ["web", "nearby"] });
  queryClient.removeQueries({ queryKey: ["web", "bots"] });
  return true;
}

export function requestCurrentWebLocation(signal: AbortSignal): Promise<WebCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is unavailable in this browser."));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    navigator.geolocation.getCurrentPosition(
      (position) => finish(() => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })),
      (error) => finish(() => reject(new Error(error.message || "Could not refresh your location."))),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  });
}

export async function runWebLocationSyncAttempt({
  coordinator,
  userId,
  resolveCoordinates,
  sync,
  onCoordinates,
  onFailure,
  onPending,
  onSuccess,
}: {
  coordinator: ReturnType<typeof createWebLocationSyncCoordinator>;
  userId: string;
  resolveCoordinates: (signal: AbortSignal) => Promise<WebCoordinates>;
  sync: (coordinates: WebCoordinates, signal: AbortSignal) => Promise<LocationUpdateResponse>;
  onCoordinates: (coordinates: WebCoordinates) => void;
  onFailure: (error: unknown, phase: WebLocationSyncPhase) => void;
  onPending: (pending: boolean) => void;
  onSuccess: (coordinates: WebCoordinates) => void;
}): Promise<WebLocationSyncOutcome> {
  const attempt = coordinator.begin(userId);
  let phase: WebLocationSyncPhase = "coordinates";
  onPending(true);

  try {
    const coordinates = await resolveCoordinates(attempt.signal);
    if (!coordinator.isCurrent(attempt.token)) return "superseded";
    onCoordinates(coordinates);
    phase = "sync";
    const acknowledgement = await sync(coordinates, attempt.signal);
    if (!coordinator.isCurrent(attempt.token)) return "superseded";
    if (acknowledgement.ok !== true) throw new Error("Invalid location acknowledgement");
    onSuccess(coordinates);
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
