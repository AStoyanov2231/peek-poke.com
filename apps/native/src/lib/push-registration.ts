import type { AuthBootstrapKey } from "./auth-bootstrap";

export type CurrentPushAuthScope = {
  signal: AbortSignal;
  currentAccessToken: () => Promise<string | null>;
};

export type CapturedPushAuth = Readonly<{
  key: AuthBootstrapKey;
  accessToken: string;
  generation: number;
}>;

export const PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS = 2_000;

export type PushProviderDeadline = Readonly<{
  timeoutMs: number;
  setTimeout: (
    callback: () => void,
    timeoutMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}>;

const defaultPushProviderDeadline: PushProviderDeadline = {
  // Push setup must never hold account switching or sign-out indefinitely.
  timeoutMs: PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS,
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class PushProviderSequenceTimeoutError extends Error {
  constructor() {
    super("Push notification provider timed out");
    this.name = "PushProviderSequenceTimeoutError";
  }
}

export type PushRegistrationDependencies = {
  isDevice: boolean;
  getPermission: () => Promise<string>;
  requestPermission: () => Promise<string>;
  acquireDeviceToken: () => Promise<string>;
  registerToken: (token: string, accessToken: string, signal: AbortSignal) => Promise<void>;
  revokeToken: (
    token: string,
    accessToken: string,
    signal: AbortSignal,
  ) => Promise<void>;
  reportCompensationError?: (error: unknown) => void;
  onCompensationSettled?: () => void;
  providerDeadline?: PushProviderDeadline;
};

export type PushUnregistrationDependencies = {
  isDevice: boolean;
  getPermission: () => Promise<string>;
  acquireDeviceToken: () => Promise<string>;
  revokeToken: (
    token: string,
    accessToken: string,
    signal: AbortSignal,
  ) => Promise<void>;
  providerDeadline?: PushProviderDeadline;
};

function providerAbortError(signal: AbortSignal) {
  if (signal.reason) return signal.reason;
  const error = new Error("Push provider token acquisition aborted");
  error.name = "AbortError";
  return error;
}

async function runPushProviderSequenceWithinDeadline<T>(
  run: (isActive: () => boolean, signal: AbortSignal) => Promise<T>,
  providerDeadline = defaultPushProviderDeadline,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw providerAbortError(signal);

  let active = true;
  const deadlineController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let detachAbort: () => void = () => {};
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = providerDeadline.setTimeout(
      () => {
        active = false;
        const error = new PushProviderSequenceTimeoutError();
        deadlineController.abort(error);
        reject(error);
      },
      providerDeadline.timeoutMs,
    );
  });
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        active = false;
        const error = providerAbortError(signal);
        deadlineController.abort(error);
        reject(error);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      detachAbort = () => signal.removeEventListener("abort", onAbort);
    })
    : null;
  const provider = Promise.resolve().then(() => run(
    () => active && !signal?.aborted,
    deadlineController.signal,
  ));

  try {
    return await Promise.race(aborted ? [provider, timeout, aborted] : [provider, timeout]);
  } finally {
    active = false;
    if (timeoutHandle !== null) providerDeadline.clearTimeout(timeoutHandle);
    detachAbort();
  }
}

async function accessTokenWhileCurrent(scope: CurrentPushAuthScope) {
  if (scope.signal.aborted) return null;
  const accessToken = await scope.currentAccessToken();
  return scope.signal.aborted ? null : accessToken;
}

function compensateRegistration(
  token: string,
  accessToken: string,
  dependencies: PushRegistrationDependencies,
) {
  void (async () => {
    try {
      await runPushProviderSequenceWithinDeadline(
        async (_isActive, signal) => {
          await dependencies.revokeToken(token, accessToken, signal);
        },
        dependencies.providerDeadline,
      );
    } catch (error) {
      try {
        dependencies.reportCompensationError?.(error);
      } catch {
        // Detached cleanup reporting must never create an unhandled rejection.
      }
    } finally {
      try {
        dependencies.onCompensationSettled?.();
      } catch (error) {
        try {
          dependencies.reportCompensationError?.(error);
        } catch {
          // Detached cleanup reporting must never create an unhandled rejection.
        }
      }
    }
  })();
}

export async function registerPushForCurrentAuth(
  scope: CurrentPushAuthScope,
  dependencies: PushRegistrationDependencies,
): Promise<string | null> {
  if (!dependencies.isDevice || !(await accessTokenWhileCurrent(scope))) return null;

  return runPushProviderSequenceWithinDeadline(
    async (isActive, deadlineSignal) => {
      if (!isActive()) return null;
      const existingPermission = await dependencies.getPermission();
      if (!isActive() || !(await accessTokenWhileCurrent(scope)) || !isActive()) return null;

      const finalPermission = existingPermission === "granted"
        ? existingPermission
        : await dependencies.requestPermission();
      if (
        !isActive()
        || !(await accessTokenWhileCurrent(scope))
        || !isActive()
        || finalPermission !== "granted"
      ) return null;

      const deviceToken = await dependencies.acquireDeviceToken();
      if (!isActive()) return null;
      const registrationAccessToken = await accessTokenWhileCurrent(scope);
      if (!isActive() || !registrationAccessToken) return null;

      try {
        await dependencies.registerToken(
          deviceToken,
          registrationAccessToken,
          deadlineSignal,
        );
      } catch (error) {
        if (!isActive() || !(await accessTokenWhileCurrent(scope))) {
          compensateRegistration(deviceToken, registrationAccessToken, dependencies);
          return null;
        }
        throw error;
      }

      if (!isActive() || !(await accessTokenWhileCurrent(scope))) {
        compensateRegistration(deviceToken, registrationAccessToken, dependencies);
        return null;
      }
      return deviceToken;
    },
    dependencies.providerDeadline,
    scope.signal,
  );
}

export async function unregisterPushForCapturedAuth(
  auth: CapturedPushAuth,
  isCurrent: () => boolean,
  dependencies: PushUnregistrationDependencies,
): Promise<string | null> {
  if (!dependencies.isDevice || !isCurrent()) return null;

  const token = await runPushProviderSequenceWithinDeadline(
    async (isActive, deadlineSignal) => {
      if (!isActive()) return null;
      const permission = await dependencies.getPermission();
      if (!isActive() || !isCurrent() || permission !== "granted") return null;

      const deviceToken = await dependencies.acquireDeviceToken();
      if (!isActive() || !isCurrent()) return null;

      await dependencies.revokeToken(deviceToken, auth.accessToken, deadlineSignal);
      return isActive() && isCurrent() ? deviceToken : null;
    },
    dependencies.providerDeadline,
  );
  return token;
}

type PushRegistrationTask = {
  key: AuthBootstrapKey;
  run: (signal: AbortSignal) => Promise<unknown>;
  onError?: (error: unknown) => void;
};

type ActivePushRegistration = {
  key: AuthBootstrapKey;
  generation: number;
  controller: AbortController;
  promise: Promise<void>;
};

type PushUnregistrationTask = {
  auth: CapturedPushAuth | null;
  run: (auth: CapturedPushAuth, isCurrent: () => boolean) => Promise<unknown>;
  onError?: (error: unknown) => void;
};

type ActivePushUnregistration = {
  auth: CapturedPushAuth;
  promise: Promise<void>;
};

function sameKey(left: AuthBootstrapKey | null, right: AuthBootstrapKey) {
  return left?.userId === right.userId
    && left.sessionIdentity === right.sessionIdentity;
}

export function createAuthScopedPushRegistrationCoordinator() {
  let generation = 0;
  let authGeneration = 0;
  let latestKey: AuthBootstrapKey | null = null;
  let latestTask: PushRegistrationTask | null = null;
  let completedKey: AuthBootstrapKey | null = null;
  let currentAuth: CapturedPushAuth | null = null;
  let active: ActivePushRegistration | null = null;
  let activeUnregistration: ActivePushUnregistration | null = null;
  let tail = Promise.resolve();

  const isCurrent = (candidate: ActivePushRegistration) => (
    active?.generation === candidate.generation
    && sameKey(latestKey, candidate.key)
    && !candidate.controller.signal.aborted
  );

  const invalidate = () => {
    generation += 1;
    latestKey = null;
    latestTask = null;
    completedKey = null;
    active?.controller.abort();
    active = null;
    return tail;
  };

  const observeAuth = (key: AuthBootstrapKey, accessToken: string) => {
    if (sameKey(currentAuth?.key ?? null, key)) {
      if (currentAuth?.accessToken !== accessToken) {
        currentAuth = { key, accessToken, generation: currentAuth!.generation };
      }
      return;
    }
    authGeneration += 1;
    currentAuth = { key, accessToken, generation: authGeneration };
  };

  const clearAuth = () => {
    if (currentAuth) authGeneration += 1;
    currentAuth = null;
  };

  const isCapturedAuthCurrent = (auth: CapturedPushAuth) => (
    currentAuth?.generation === auth.generation
    && sameKey(currentAuth.key, auth.key)
  );

  const start = ({ key, run, onError }: PushRegistrationTask) => {
    latestTask = { key, run, onError };
    latestKey = key;
    if (sameKey(completedKey, key)) return Promise.resolve();
    if (active && sameKey(active.key, key)) return active.promise;

    generation += 1;
    completedKey = null;
    active?.controller.abort();
    const predecessor = tail;
    const candidate: ActivePushRegistration = {
      key,
      generation,
      controller: new AbortController(),
      promise: Promise.resolve(),
    };

    candidate.promise = (async () => {
      await predecessor;
      if (!isCurrent(candidate)) return;
      try {
        await run(candidate.controller.signal);
        if (isCurrent(candidate)) completedKey = candidate.key;
      } catch (error) {
        if (isCurrent(candidate)) {
          try {
            onError?.(error);
          } catch {
            // Error reporting must not create an unhandled registration rejection.
          }
        }
      } finally {
        if (active?.generation === candidate.generation) active = null;
      }
    })();

    active = candidate;
    tail = candidate.promise;
    return candidate.promise;
  };

  const unregister = ({ auth, run, onError }: PushUnregistrationTask) => {
    if (!auth) return Promise.resolve();
    if (!isCapturedAuthCurrent(auth)) return Promise.resolve();
    if (activeUnregistration?.auth.generation === auth.generation) {
      return activeUnregistration.promise;
    }

    generation += 1;
    latestKey = null;
    latestTask = null;
    completedKey = null;
    active?.controller.abort();
    active = null;
    const predecessor = tail;
    const candidate: ActivePushUnregistration = {
      auth,
      promise: Promise.resolve(),
    };

    candidate.promise = (async () => {
      await predecessor;
      try {
        await run(auth, () => isCapturedAuthCurrent(auth));
      } catch (error) {
        try {
          onError?.(error);
        } catch {
          // Error reporting must not create an unhandled cleanup rejection.
        }
      } finally {
        if (activeUnregistration === candidate) activeUnregistration = null;
      }
    })();

    activeUnregistration = candidate;
    tail = candidate.promise;
    return candidate.promise;
  };

  return {
    start,
    unregister,
    invalidate,
    observeAuth,
    clearAuth,
    captureAuth() {
      return currentAuth;
    },
    retryLatestUnless(staleKey: AuthBootstrapKey) {
      if (!latestTask || !latestKey || sameKey(latestKey, staleKey)) {
        return Promise.resolve();
      }
      completedKey = null;
      return start(latestTask);
    },
    isLatest(key: AuthBootstrapKey) {
      return sameKey(latestKey, key);
    },
  };
}
