export type AuthBootstrapKey = Readonly<{
  userId: string;
  sessionIdentity: string;
}>;

export type AuthBootstrapOutcome = "committed" | "already-committed" | "stale";

export function authSessionIdentity(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload || typeof globalThis.atob !== "function") return accessToken;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const claims = JSON.parse(globalThis.atob(`${normalized}${padding}`)) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === "string" && claims.session_id.length > 0
      ? claims.session_id
      : accessToken;
  } catch {
    return accessToken;
  }
}

type AuthBootstrapTask<T> = {
  key: AuthBootstrapKey;
  load: (signal: AbortSignal) => Promise<T>;
  commit: (value: T) => void | Promise<void>;
};

type ActiveBootstrap = {
  key: AuthBootstrapKey;
  generation: number;
  controller: AbortController;
  promise: Promise<AuthBootstrapOutcome>;
};

function sameKey(left: AuthBootstrapKey | null, right: AuthBootstrapKey) {
  return left?.userId === right.userId
    && left.sessionIdentity === right.sessionIdentity;
}

export function createAuthBootstrapCoordinator() {
  let generation = 0;
  let latestKey: AuthBootstrapKey | null = null;
  let committedKey: AuthBootstrapKey | null = null;
  let active: ActiveBootstrap | null = null;

  const isCurrent = (candidate: ActiveBootstrap) => (
    active?.generation === candidate.generation
    && sameKey(latestKey, candidate.key)
    && !candidate.controller.signal.aborted
  );

  const invalidate = () => {
    generation += 1;
    latestKey = null;
    committedKey = null;
    active?.controller.abort();
    active = null;
  };

  const start = <T>({ key, load, commit }: AuthBootstrapTask<T>): Promise<AuthBootstrapOutcome> => {
    latestKey = key;

    if (sameKey(committedKey, key)) {
      return Promise.resolve("already-committed");
    }
    if (active && sameKey(active.key, key)) {
      return active.promise;
    }

    generation += 1;
    committedKey = null;
    active?.controller.abort();

    const candidate: ActiveBootstrap = {
      key,
      generation,
      controller: new AbortController(),
      promise: Promise.resolve("stale"),
    };

    candidate.promise = (async () => {
      try {
        const value = await load(candidate.controller.signal);
        if (!isCurrent(candidate)) return "stale";

        await commit(value);
        if (!isCurrent(candidate)) return "stale";

        committedKey = candidate.key;
        return "committed";
      } catch (error) {
        if (!isCurrent(candidate)) return "stale";
        throw error;
      } finally {
        if (active?.generation === candidate.generation) {
          active = null;
        }
      }
    })();

    active = candidate;
    return candidate.promise;
  };

  return {
    start,
    invalidate,
    isLatest(key: AuthBootstrapKey) {
      return sameKey(latestKey, key);
    },
  };
}
