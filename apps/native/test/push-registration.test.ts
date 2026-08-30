import { describe, expect, it, vi } from "vitest";
import type { AuthBootstrapKey } from "@/lib/auth-bootstrap";
import {
  createAuthScopedPushRegistrationCoordinator,
  PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS,
  registerPushForCurrentAuth,
  unregisterPushForCapturedAuth,
  type PushProviderDeadline,
  type PushRegistrationDependencies,
} from "@/lib/push-registration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const key = (userId: string, sessionIdentity: string): AuthBootstrapKey => ({
  userId,
  sessionIdentity,
});

function dependencies(
  overrides: Partial<PushRegistrationDependencies> = {},
): PushRegistrationDependencies {
  return {
    isDevice: true,
    getPermission: async () => "granted",
    requestPermission: async () => "granted",
    acquireDeviceToken: async () => "ExpoPushToken[device-token]",
    registerToken: async () => undefined,
    revokeToken: async () => undefined,
    ...overrides,
  };
}

const fakeDeadline = (): PushProviderDeadline => ({
  timeoutMs: PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS,
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (handle) => clearTimeout(handle),
});

describe("auth-scoped push registration", () => {
  it("serializes a delayed A registration and compensation before B becomes owner", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedARegistration = deferred<void>();
    const aRegistrationStarted = deferred<void>();
    const events: string[] = [];
    let currentUser: "a" | "b" | null = "a";
    let tokenOwner: "a" | "b" | null = null;

    const run = (user: "a" | "b") => (signal: AbortSignal) => registerPushForCurrentAuth({
      signal,
      currentAccessToken: async () => currentUser === user ? `access-${user}` : null,
    }, dependencies({
      registerToken: async () => {
        events.push(`register-${user}`);
        if (user === "a") {
          aRegistrationStarted.resolve();
          await delayedARegistration.promise;
        }
        tokenOwner = user;
      },
      revokeToken: async () => {
        events.push(`revoke-${user}`);
        if (tokenOwner === user) tokenOwner = null;
      },
    }));

    const userA = coordinator.start({ key: key("user-a", "session-a"), run: run("a") });
    await aRegistrationStarted.promise;

    currentUser = null;
    const signedOut = coordinator.invalidate();
    currentUser = "b";
    const userB = coordinator.start({ key: key("user-b", "session-b"), run: run("b") });

    delayedARegistration.resolve();
    await Promise.all([userA, signedOut, userB]);

    expect(events).toEqual(["register-a", "revoke-a", "register-b"]);
    expect(tokenOwner).toBe("b");
  });

  it("coalesces repeated registration for the same user and session", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedToken = deferred<string>();
    const providerStarted = deferred<void>();
    const acquireDeviceToken = vi.fn(() => {
      providerStarted.resolve();
      return delayedToken.promise;
    });
    const registerToken = vi.fn(async () => undefined);
    const registrationKey = key("user-a", "session-a");
    const run = (signal: AbortSignal) => registerPushForCurrentAuth({
      signal,
      currentAccessToken: async () => "access-a",
    }, dependencies({ acquireDeviceToken, registerToken }));

    const first = coordinator.start({ key: registrationKey, run });
    const second = coordinator.start({ key: registrationKey, run });

    expect(second).toBe(first);
    await providerStarted.promise;
    expect(acquireDeviceToken).toHaveBeenCalledTimes(1);
    delayedToken.resolve("ExpoPushToken[device-token]");
    await first;

    await coordinator.start({ key: registrationKey, run });
    expect(acquireDeviceToken).toHaveBeenCalledTimes(1);
    expect(registerToken).toHaveBeenCalledTimes(1);
  });

  it("reports a provider rejection without an unhandled registration promise", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const providerError = new Error("provider unavailable");
    const onError = vi.fn();

    await expect(coordinator.start({
      key: key("user-a", "session-a"),
      run: (signal) => registerPushForCurrentAuth({
        signal,
        currentAccessToken: async () => "access-a",
      }, dependencies({
        acquireDeviceToken: async () => { throw providerError; },
      })),
      onError,
    })).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(providerError);
  });

  it("aborts cleanup while a provider call is delayed and performs no backend mutation", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedToken = deferred<string>();
    const providerStarted = deferred<void>();
    const registerToken = vi.fn(async () => undefined);
    let registrationSignal: AbortSignal | undefined;

    const attempt = coordinator.start({
      key: key("user-a", "session-a"),
      run: (signal) => {
        registrationSignal = signal;
        return registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          acquireDeviceToken: () => {
            providerStarted.resolve();
            return delayedToken.promise;
          },
          registerToken,
        }));
      },
    });

    await providerStarted.promise;
    const cleanup = coordinator.invalidate();
    expect(registrationSignal?.aborted).toBe(true);

    delayedToken.resolve("ExpoPushToken[device-token]");
    await Promise.all([attempt, cleanup]);
    expect(registerToken).not.toHaveBeenCalled();
  });

  it("serializes delayed A token lookup before B registration and skips stale A deletion", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedToken = deferred<string>();
    const providerStarted = deferred<void>();
    const events: string[] = [];
    const userAKey = key("user-a", "session-a");
    const userBKey = key("user-b", "session-b");

    coordinator.observeAuth(userAKey, "access-a");
    const capturedA = coordinator.captureAuth();
    const unregisterA = coordinator.unregister({
      auth: capturedA,
      run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
        isDevice: true,
        getPermission: async () => "granted",
        acquireDeviceToken: () => {
          events.push("lookup-a");
          providerStarted.resolve();
          return delayedToken.promise;
        },
        revokeToken: async () => {
          events.push("revoke-a");
        },
      }),
    });

    await providerStarted.promise;
    coordinator.observeAuth(userBKey, "access-b");
    const registerB = coordinator.start({
      key: userBKey,
      run: async () => {
        events.push("register-b");
      },
    });

    delayedToken.resolve("ExpoPushToken[device-token]");
    await Promise.all([unregisterA, registerB]);

    expect(events).toEqual(["lookup-a", "register-b"]);
  });

  it("revokes the current captured session using only its captured access token", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const userAKey = key("user-a", "session-a");
    const revokeToken = vi.fn(async () => undefined);
    coordinator.observeAuth(userAKey, "access-a");

    await coordinator.unregister({
      auth: coordinator.captureAuth(),
      run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
        isDevice: true,
        getPermission: async () => "granted",
        acquireDeviceToken: async () => "ExpoPushToken[device-token]",
        revokeToken,
      }),
    });

    expect(revokeToken).toHaveBeenCalledWith(
      "ExpoPushToken[device-token]",
      "access-a",
      expect.any(AbortSignal),
    );
  });

  it("keeps a capture valid across token refresh in the same auth session", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const userAKey = key("user-a", "session-a");
    const revokeToken = vi.fn(async () => undefined);
    coordinator.observeAuth(userAKey, "access-a-before-refresh");
    const capturedA = coordinator.captureAuth();
    coordinator.observeAuth(userAKey, "access-a-after-refresh");

    await coordinator.unregister({
      auth: capturedA,
      run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
        isDevice: true,
        getPermission: async () => "granted",
        acquireDeviceToken: async () => "ExpoPushToken[device-token]",
        revokeToken,
      }),
    });

    expect(revokeToken).toHaveBeenCalledWith(
      "ExpoPushToken[device-token]",
      "access-a-before-refresh",
      expect.any(AbortSignal),
    );
  });

  it("skips backend cleanup when sign-out clears auth during provider lookup", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedToken = deferred<string>();
    const providerStarted = deferred<void>();
    const revokeToken = vi.fn(async () => undefined);
    coordinator.observeAuth(key("user-a", "session-a"), "access-a");

    const cleanup = coordinator.unregister({
      auth: coordinator.captureAuth(),
      run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
        isDevice: true,
        getPermission: async () => "granted",
        acquireDeviceToken: () => {
          providerStarted.resolve();
          return delayedToken.promise;
        },
        revokeToken,
      }),
    });

    await providerStarted.promise;
    coordinator.clearAuth();
    delayedToken.resolve("ExpoPushToken[device-token]");
    await cleanup;

    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("does not abort B registration when handed an already-stale A capture", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const delayedBRegistration = deferred<void>();
    const userAKey = key("user-a", "session-a");
    const userBKey = key("user-b", "session-b");
    const unregisterA = vi.fn(async () => undefined);
    const registerB = vi.fn(() => delayedBRegistration.promise);
    coordinator.observeAuth(userAKey, "access-a");
    const capturedA = coordinator.captureAuth();
    coordinator.observeAuth(userBKey, "access-b");

    const activeB = coordinator.start({ key: userBKey, run: registerB });
    await expect(coordinator.unregister({
      auth: capturedA,
      run: unregisterA,
    })).resolves.toBeUndefined();

    delayedBRegistration.resolve();
    await activeB;
    expect(registerB).toHaveBeenCalledOnce();
    expect(unregisterA).not.toHaveBeenCalled();
  });

  it("reports unregister provider errors without an unhandled cleanup promise", async () => {
    const coordinator = createAuthScopedPushRegistrationCoordinator();
    const providerError = new Error("provider unavailable");
    const onError = vi.fn();
    coordinator.observeAuth(key("user-a", "session-a"), "access-a");

    await expect(coordinator.unregister({
      auth: coordinator.captureAuth(),
      run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
        isDevice: true,
        getPermission: async () => "granted",
        acquireDeviceToken: async () => { throw providerError; },
        revokeToken: async () => undefined,
      }),
      onError,
    })).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(providerError);
  });

  it("releases a hung A cleanup at the deadline so B and sign-out can continue", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const providerStarted = deferred<void>();
      const delayedPermission = deferred<string>();
      const events: string[] = [];
      const acquireDeviceToken = vi.fn(async () => "ExpoPushToken[device-token]");
      const userAKey = key("user-a", "session-a");
      const userBKey = key("user-b", "session-b");
      coordinator.observeAuth(userAKey, "access-a");

      const cleanupA = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: () => {
            providerStarted.resolve();
            return delayedPermission.promise;
          },
          acquireDeviceToken,
          revokeToken: async () => {
            events.push("revoke-a");
          },
          providerDeadline: fakeDeadline(),
        }),
        onError: () => events.push("timeout-a"),
      });
      const signOut = cleanupA.then(() => events.push("sign-out"));
      await providerStarted.promise;

      coordinator.observeAuth(userBKey, "access-b");
      const registerB = coordinator.start({
        key: userBKey,
        run: async () => {
          events.push("register-b");
        },
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await Promise.all([cleanupA, signOut, registerB]);
      delayedPermission.resolve("granted");
      await Promise.resolve();

      expect(events).toEqual(["timeout-a", "sign-out", "register-b"]);
      expect(acquireDeviceToken).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases an aborted hung registration before starting sign-out cleanup", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const providerStarted = deferred<void>();
      const registrationKey = key("user-a", "session-a");
      const events: string[] = [];
      const requestPermission = vi.fn(async () => "granted");
      const acquireDeviceToken = vi.fn(async () => "ExpoPushToken[device-token]");
      coordinator.observeAuth(registrationKey, "access-a");

      const registration = coordinator.start({
        key: registrationKey,
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          getPermission: () => {
            providerStarted.resolve();
            return new Promise<string>(() => undefined);
          },
          requestPermission,
          acquireDeviceToken,
          providerDeadline: fakeDeadline(),
        })),
      });
      await providerStarted.promise;

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: async () => {
          events.push("cleanup-a");
        },
      });
      await Promise.all([registration, cleanup]);

      expect(events).toEqual(["cleanup-a"]);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(acquireDeviceToken).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out a hanging permission request and consumes its late rejection", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedPermission = deferred<string>();
      const permissionStarted = deferred<void>();
      const acquireDeviceToken = vi.fn(async () => "ExpoPushToken[device-token]");
      const registerToken = vi.fn(async () => undefined);
      const onError = vi.fn();

      const registration = coordinator.start({
        key: key("user-a", "session-a"),
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          getPermission: async () => "undetermined",
          requestPermission: () => {
            permissionStarted.resolve();
            return delayedPermission.promise;
          },
          acquireDeviceToken,
          registerToken,
          providerDeadline: fakeDeadline(),
        })),
        onError,
      });
      await permissionStarted.promise;

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await registration;
      delayedPermission.reject(new Error("late permission failure"));
      await Promise.resolve();

      expect(onError).toHaveBeenCalledOnce();
      expect(acquireDeviceToken).not.toHaveBeenCalled();
      expect(registerToken).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses one deadline budget across all slow provider stages", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const acquireDeviceToken = vi.fn(() => new Promise<string>((resolve) => {
        setTimeout(() => resolve("ExpoPushToken[late-device-token]"), 800);
      }));
      const registerToken = vi.fn(async () => undefined);
      const onError = vi.fn();
      const delayedStatus = (status: string) => new Promise<string>((resolve) => {
        setTimeout(() => resolve(status), 800);
      });

      const registration = coordinator.start({
        key: key("user-a", "session-a"),
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          getPermission: () => delayedStatus("undetermined"),
          requestPermission: () => delayedStatus("granted"),
          acquireDeviceToken,
          registerToken,
          providerDeadline: fakeDeadline(),
        })),
        onError,
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      expect(registerToken).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await registration;
      await vi.advanceTimersByTimeAsync(800);

      expect(onError).toHaveBeenCalledOnce();
      expect(acquireDeviceToken).toHaveBeenCalledOnce();
      expect(registerToken).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes the whole provider sequence just before the shared deadline", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedStatus = (status: string, delayMs: number) => new Promise<string>((resolve) => {
        setTimeout(() => resolve(status), delayMs);
      });
      const registerToken = vi.fn(async () => undefined);

      const registration = coordinator.start({
        key: key("user-a", "session-a"),
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          getPermission: () => delayedStatus("undetermined", 600),
          requestPermission: () => delayedStatus("granted", 600),
          acquireDeviceToken: () => delayedStatus("ExpoPushToken[device-token]", 799),
          registerToken,
          providerDeadline: fakeDeadline(),
        })),
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      await registration;

      expect(registerToken).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a provider result that settles after timeout without stale effects", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedToken = deferred<string>();
      const providerStarted = deferred<void>();
      const revokeToken = vi.fn(async () => undefined);
      const onError = vi.fn();
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: () => {
            providerStarted.resolve();
            return delayedToken.promise;
          },
          revokeToken,
          providerDeadline: fakeDeadline(),
        }),
        onError,
      });
      await providerStarted.promise;

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await cleanup;
      delayedToken.resolve("ExpoPushToken[late-device-token]");
      await Promise.resolve();

      expect(onError).toHaveBeenCalledOnce();
      expect(revokeToken).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves normal scoped cleanup when the provider settles just before timeout", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedToken = deferred<string>();
      const revokeToken = vi.fn(async () => undefined);
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: () => delayedToken.promise,
          revokeToken,
          providerDeadline: fakeDeadline(),
        }),
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      delayedToken.resolve("ExpoPushToken[device-token]");
      await cleanup;

      expect(revokeToken).toHaveBeenCalledWith(
        "ExpoPushToken[device-token]",
        "access-a",
        expect.any(AbortSignal),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses only the remaining cleanup budget after a 1.5 second provider lookup", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const deleteStarted = deferred<void>();
      const events: string[] = [];
      let deleteSignal: AbortSignal | null = null;
      const userAKey = key("user-a", "session-a");
      const userBKey = key("user-b", "session-b");
      coordinator.observeAuth(userAKey, "access-a");

      const cleanupA = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: () => new Promise((resolve) => {
            setTimeout(() => resolve("ExpoPushToken[device-token]"), 1_500);
          }),
          revokeToken: async (_token, _accessToken, signal) => {
            deleteSignal = signal;
            deleteStarted.resolve();
            await new Promise<void>(() => undefined);
          },
          providerDeadline: fakeDeadline(),
        }),
        onError: () => events.push("timeout-a"),
      });
      const signOut = cleanupA.then(() => events.push("sign-out"));

      await vi.advanceTimersByTimeAsync(1_500);
      await deleteStarted.promise;
      coordinator.observeAuth(userBKey, "access-b");
      const registerB = coordinator.start({
        key: userBKey,
        run: async () => {
          events.push("register-b");
        },
      });

      await vi.advanceTimersByTimeAsync(499);
      expect(events).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([cleanupA, signOut, registerB]);

      expect(deleteSignal?.aborted).toBe(true);
      expect(events).toEqual(["timeout-a", "sign-out", "register-b"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a quick-provider hung DELETE by the original cleanup deadline", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const deleteStarted = deferred<void>();
      const onError = vi.fn();
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: async () => "ExpoPushToken[device-token]",
          revokeToken: async () => {
            deleteStarted.resolve();
            await new Promise<void>(() => undefined);
          },
          providerDeadline: fakeDeadline(),
        }),
        onError,
      });
      await deleteStarted.promise;

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      expect(onError).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await cleanup;

      expect(onError).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows DELETE to finish just before the original total deadline", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const revokeToken = vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 499));
      });
      const onError = vi.fn();
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: () => new Promise((resolve) => {
            setTimeout(() => resolve("ExpoPushToken[device-token]"), 1_500);
          }),
          revokeToken,
          providerDeadline: fakeDeadline(),
        }),
        onError,
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      await cleanup;

      expect(revokeToken).toHaveBeenCalledOnce();
      expect(onError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts DELETE at timeout and consumes a late backend rejection", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const lateDelete = deferred<void>();
      const onError = vi.fn();
      const afterDelete = vi.fn();
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: async () => "ExpoPushToken[device-token]",
          revokeToken: async (_token, _accessToken, signal) => {
            await Promise.race([
              lateDelete.promise,
              new Promise<never>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason), { once: true });
              }),
            ]);
            afterDelete();
          },
          providerDeadline: fakeDeadline(),
        }),
        onError,
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await cleanup;
      lateDelete.reject(new Error("late backend failure"));
      await Promise.resolve();

      expect(onError).toHaveBeenCalledOnce();
      expect(afterDelete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a hung registration POST by the original provider-operation deadline", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const postStarted = deferred<void>();
      const onError = vi.fn();
      let postSignal: AbortSignal | null = null;

      const registration = coordinator.start({
        key: key("user-a", "session-a"),
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => "access-a",
        }, dependencies({
          getPermission: async () => "granted",
          acquireDeviceToken: () => new Promise((resolve) => {
            setTimeout(() => resolve("ExpoPushToken[device-token]"), 1_500);
          }),
          registerToken: async (_token, _accessToken, signal) => {
            postSignal = signal;
            postStarted.resolve();
            await new Promise<void>(() => undefined);
          },
          providerDeadline: fakeDeadline(),
        })),
        onError,
      });

      await vi.advanceTimersByTimeAsync(1_500);
      await postStarted.promise;
      await vi.advanceTimersByTimeAsync(499);
      expect(onError).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await registration;

      expect(postSignal?.aborted).toBe(true);
      expect(onError).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("repairs B after a late accepted A POST and bounded hung compensation", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedAPost = deferred<void>();
      const postStarted = deferred<void>();
      const delayedCompensation = deferred<void>();
      const compensationStarted = deferred<void>();
      const compensationError = vi.fn();
      const userAKey = key("user-a", "session-a");
      const userBKey = key("user-b", "session-b");
      let currentUser: "a" | "b" = "a";
      let tokenOwner: "a" | "b" | null = null;
      let bRegistrations = 0;

      const registrationA = coordinator.start({
        key: userAKey,
        run: (signal) => registerPushForCurrentAuth({
          signal,
          currentAccessToken: async () => currentUser === "a" ? "access-a" : null,
        }, dependencies({
          registerToken: async () => {
            postStarted.resolve();
            await delayedAPost.promise;
            tokenOwner = "a";
          },
          revokeToken: async (_token, accessToken) => {
            expect(accessToken).toBe("access-a");
            compensationStarted.resolve();
            await delayedCompensation.promise;
            if (tokenOwner === "a") tokenOwner = null;
          },
          providerDeadline: fakeDeadline(),
          reportCompensationError: compensationError,
          onCompensationSettled: () => {
            void coordinator.retryLatestUnless(userAKey);
          },
        })),
      });
      await postStarted.promise;

      currentUser = "b";
      const registerB = () => {
        bRegistrations += 1;
        tokenOwner = "b";
        return Promise.resolve();
      };
      const firstB = coordinator.start({ key: userBKey, run: registerB });
      await Promise.all([registrationA, firstB]);
      expect(tokenOwner).toBe("b");

      delayedAPost.resolve();
      await compensationStarted.promise;
      expect(tokenOwner).toBe("a");
      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await Promise.resolve();

      expect(compensationError).toHaveBeenCalledOnce();
      expect(bRegistrations).toBe(2);
      expect(tokenOwner).toBe("b");

      delayedCompensation.resolve();
      await Promise.resolve();
      expect(tokenOwner).toBe("b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("consumes a compensation rejection that arrives after its cleanup deadline", async () => {
    vi.useFakeTimers();
    try {
      const delayedCompensation = deferred<void>();
      const compensationStarted = deferred<void>();
      const reportCompensationError = vi.fn();
      let current = true;

      await expect(registerPushForCurrentAuth({
        signal: new AbortController().signal,
        currentAccessToken: async () => current ? "access-a" : null,
      }, dependencies({
        registerToken: async () => {
          current = false;
        },
        revokeToken: async () => {
          compensationStarted.resolve();
          await delayedCompensation.promise;
        },
        providerDeadline: fakeDeadline(),
        reportCompensationError,
      }))).resolves.toBeNull();
      await compensationStarted.promise;

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      delayedCompensation.reject(new Error("late compensation rejection"));
      await Promise.resolve();

      expect(reportCompensationError).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("consumes a late provider rejection after timeout without an unhandled rejection", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createAuthScopedPushRegistrationCoordinator();
      const delayedToken = deferred<string>();
      const onError = vi.fn();
      coordinator.observeAuth(key("user-a", "session-a"), "access-a");

      const cleanup = coordinator.unregister({
        auth: coordinator.captureAuth(),
        run: (auth, isCurrent) => unregisterPushForCapturedAuth(auth, isCurrent, {
          isDevice: true,
          getPermission: async () => "granted",
          acquireDeviceToken: () => delayedToken.promise,
          revokeToken: async () => undefined,
          providerDeadline: fakeDeadline(),
        }),
        onError,
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
      await cleanup;
      delayedToken.reject(new Error("late provider failure"));
      await Promise.resolve();

      expect(onError).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
