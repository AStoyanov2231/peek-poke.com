import { describe, expect, it, vi } from "vitest";
import { createUnauthorizedSessionRecovery } from "../src/lib/session-recovery-policy";
import { PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS } from "../src/lib/push-registration";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    deactivateAuthenticatedUi: vi.fn(),
    clearServerState: vi.fn(),
    resetAppState: vi.fn(),
    resetCallState: vi.fn(),
    unregisterPush: vi.fn(async () => undefined),
    stopAuthRefresh: vi.fn(async () => undefined),
    signOutLocally: vi.fn(async () => ({ error: null })),
    clearPersistedSession: vi.fn(async () => undefined),
    clearRealtimeSession: vi.fn(async () => undefined),
    replaceWithLogin: vi.fn(),
    reportError: vi.fn(),
    ...overrides,
  };
}

describe("unauthorized session recovery", () => {
  it("clears every user-scoped state and replaces the route once", async () => {
    const deps = dependencies();
    const recover = createUnauthorizedSessionRecovery(deps);

    await recover();

    expect(deps.clearServerState).toHaveBeenCalledOnce();
    expect(deps.deactivateAuthenticatedUi).toHaveBeenCalledOnce();
    expect(deps.resetAppState).toHaveBeenCalledOnce();
    expect(deps.resetCallState).toHaveBeenCalledOnce();
    expect(deps.unregisterPush).toHaveBeenCalledOnce();
    expect(deps.stopAuthRefresh).toHaveBeenCalledOnce();
    expect(deps.signOutLocally).toHaveBeenCalledOnce();
    expect(deps.clearPersistedSession).toHaveBeenCalledOnce();
    expect(deps.clearRealtimeSession).toHaveBeenCalledOnce();
    expect(deps.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("coalesces repeated presses into one recovery", async () => {
    const pending = deferred();
    const deps = dependencies({ unregisterPush: vi.fn(() => pending.promise) });
    const recover = createUnauthorizedSessionRecovery(deps);

    const first = recover();
    const second = recover();
    expect(second).toBe(first);
    pending.resolve();
    await Promise.all([first, second]);

    expect(deps.signOutLocally).toHaveBeenCalledOnce();
    expect(deps.replaceWithLogin).toHaveBeenCalledOnce();
  });

  it("awaits an unregister cleanup captured before recovery deactivates auth", async () => {
    const pending = deferred();
    const capturedCleanup = vi.fn(() => pending.promise);
    const deps = dependencies();
    const recover = createUnauthorizedSessionRecovery(deps);

    const attempt = recover({ unregisterPush: capturedCleanup });
    await vi.waitFor(() => expect(capturedCleanup).toHaveBeenCalledOnce());
    expect(deps.unregisterPush).not.toHaveBeenCalled();
    expect(deps.signOutLocally).not.toHaveBeenCalled();

    pending.resolve();
    await attempt;

    expect(deps.signOutLocally).toHaveBeenCalledOnce();
  });

  it("continues local sign-out and login after bounded push cleanup", async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const deps = dependencies({
        signOutLocally: vi.fn(async () => {
          events.push("local-sign-out");
          return { error: null };
        }),
        replaceWithLogin: vi.fn(() => events.push("login")),
      });
      const recover = createUnauthorizedSessionRecovery(deps);
      const attempt = recover({
        unregisterPush: () => new Promise((resolve) => {
          setTimeout(resolve, PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS);
        }),
      });

      await vi.advanceTimersByTimeAsync(PUSH_PROVIDER_ACQUISITION_TIMEOUT_MS - 1);
      expect(events).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await attempt;

      expect(events).toEqual(["local-sign-out", "login"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forces local teardown and reaches login when cleanup operations fail", async () => {
    const deps = dependencies({
      clearServerState: vi.fn(() => {
        throw new Error("query cleanup failed");
      }),
      unregisterPush: vi.fn(async () => {
        throw new Error("notification cleanup failed");
      }),
      stopAuthRefresh: vi.fn(async () => {
        throw new Error("refresh cleanup failed");
      }),
      signOutLocally: vi.fn(async () => ({ error: new Error("network failed") })),
      clearPersistedSession: vi.fn(async () => {
        throw new Error("secure storage failed");
      }),
      clearRealtimeSession: vi.fn(async () => {
        throw new Error("realtime cleanup failed");
      }),
    });
    const recover = createUnauthorizedSessionRecovery(deps);

    await expect(recover()).resolves.toBeUndefined();

    expect(deps.resetAppState).toHaveBeenCalledOnce();
    expect(deps.resetCallState).toHaveBeenCalledOnce();
    expect(deps.clearPersistedSession).toHaveBeenCalledOnce();
    expect(deps.clearRealtimeSession).toHaveBeenCalledOnce();
    expect(deps.replaceWithLogin).toHaveBeenCalledOnce();
    expect(deps.reportError).toHaveBeenCalledTimes(6);
  });
});
