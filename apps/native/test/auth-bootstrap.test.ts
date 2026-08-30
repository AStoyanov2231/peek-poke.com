import { describe, expect, it, vi } from "vitest";
import {
  authSessionIdentity,
  createAuthBootstrapCoordinator,
  type AuthBootstrapKey,
} from "../src/lib/auth-bootstrap";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
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

describe("auth bootstrap coordinator", () => {
  it("uses the stable Supabase session claim across access-token refreshes", () => {
    const payload = (suffix: string) => globalThis.btoa(JSON.stringify({
      session_id: "session-a",
      token_generation: suffix,
    })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    expect(authSessionIdentity(`header.${payload("old")}.signature`)).toBe("session-a");
    expect(authSessionIdentity(`header.${payload("new")}.signature`)).toBe("session-a");
    expect(authSessionIdentity("not-a-jwt")).toBe("not-a-jwt");
  });

  it("prevents an old user from committing after sign-out and a new sign-in", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const userALoad = deferred<string>();
    const commits: string[] = [];
    let userASignal: AbortSignal | undefined;

    const userA = coordinator.start({
      key: key("user-a", "session-a"),
      load: (signal) => {
        userASignal = signal;
        return userALoad.promise;
      },
      commit: (value) => {
        commits.push(value);
      },
    });

    coordinator.invalidate();

    const userB = coordinator.start({
      key: key("user-b", "session-b"),
      load: async () => "user-b",
      commit: (value) => {
        commits.push(value);
      },
    });

    await expect(userB).resolves.toBe("committed");
    expect(userASignal?.aborted).toBe(true);

    userALoad.resolve("user-a");
    await expect(userA).resolves.toBe("stale");
    expect(commits).toEqual(["user-b"]);
  });

  it("coalesces repeated work for the same user and session", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const commit = vi.fn();
    const bootstrapKey = key("user-a", "session-a");

    const first = coordinator.start({ key: bootstrapKey, load, commit });
    const second = coordinator.start({ key: bootstrapKey, load, commit });

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve("ready");
    await expect(first).resolves.toBe("committed");
    expect(commit).toHaveBeenCalledTimes(1);

    await expect(coordinator.start({ key: bootstrapKey, load, commit }))
      .resolves.toBe("already-committed");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("makes a directly switched user authoritative before the old load settles", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const oldUserLoad = deferred<string>();
    const commit = vi.fn();
    const oldAttempt = coordinator.start({
      key: key("user-a", "session-a"),
      load: () => oldUserLoad.promise,
      commit,
    });

    await expect(coordinator.start({
      key: key("user-b", "session-b"),
      load: async () => "user-b",
      commit,
    })).resolves.toBe("committed");

    oldUserLoad.resolve("user-a");
    await expect(oldAttempt).resolves.toBe("stale");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("user-b");
  });

  it("lets the current session retry after a failure", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const bootstrapKey = key("user-a", "session-a");
    const commit = vi.fn();

    await expect(coordinator.start({
      key: bootstrapKey,
      load: async () => {
        throw new Error("offline");
      },
      commit,
    })).rejects.toThrow("offline");

    await expect(coordinator.start({
      key: bootstrapKey,
      load: async () => "recovered",
      commit,
    })).resolves.toBe("committed");
    expect(commit).toHaveBeenCalledWith("recovered");
  });

  it("aborts cleanup work and blocks a late commit", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const pending = deferred<string>();
    const commit = vi.fn();
    let signal: AbortSignal | undefined;
    const bootstrapKey = key("user-a", "session-a");

    const attempt = coordinator.start({
      key: bootstrapKey,
      load: (candidateSignal) => {
        signal = candidateSignal;
        return pending.promise;
      },
      commit,
    });

    coordinator.invalidate();
    expect(signal?.aborted).toBe(true);
    expect(coordinator.isLatest(bootstrapKey)).toBe(false);

    pending.resolve("late");
    await expect(attempt).resolves.toBe("stale");
    expect(commit).not.toHaveBeenCalled();
  });

  it("treats a new session for the same user as a new generation", async () => {
    const coordinator = createAuthBootstrapCoordinator();
    const oldSessionLoad = deferred<string>();
    const commit = vi.fn();
    const oldAttempt = coordinator.start({
      key: key("user-a", "session-a"),
      load: () => oldSessionLoad.promise,
      commit,
    });

    await expect(coordinator.start({
      key: key("user-a", "session-b"),
      load: async () => "new-session",
      commit,
    })).resolves.toBe("committed");

    oldSessionLoad.resolve("old-session");
    await expect(oldAttempt).resolves.toBe("stale");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("new-session");
  });
});
