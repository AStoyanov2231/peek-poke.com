import { idempotencyKeySchema } from "./contract";
import { ApiTransportError } from "./errors";

export type FriendRemovalAttempt = Readonly<{
  key: string;
  friendshipId: string;
}>;

export type FriendRemovalAttemptCoordinator = {
  run: <Result>(
    friendshipId: string,
    deliver: (attempt: FriendRemovalAttempt) => Promise<Result>,
    commit?: (result: Result, attempt: FriendRemovalAttempt) => void,
  ) => Promise<Result>;
  peek: (friendshipId: string) => FriendRemovalAttempt | null;
  discard: (friendshipId: string) => boolean;
  reset: () => void;
};

function outcomeMayHaveCommitted(error: unknown) {
  return error instanceof ApiTransportError
    && (
      error.status === 0
      || error.code === "INVALID_RESPONSE"
      || error.code === "FRIENDSHIP_REMOVAL_IDEMPOTENCY_UNAVAILABLE"
    );
}

export function createFriendRemovalAttemptCoordinator(
  createKey: () => string,
): FriendRemovalAttemptCoordinator {
  const pending = new Map<string, {
    attempt: FriendRemovalAttempt;
    inFlight: Promise<unknown> | null;
  }>();

  function prepare(friendshipId: string) {
    const existing = pending.get(friendshipId);
    if (existing) return existing;

    const key = idempotencyKeySchema.parse(createKey());
    const attempt = Object.freeze({ key, friendshipId });
    const state = { attempt, inFlight: null };
    pending.set(friendshipId, state);
    return state;
  }

  return {
    run<Result>(
      friendshipId: string,
      deliver: (attempt: FriendRemovalAttempt) => Promise<Result>,
      commit?: (result: Result, attempt: FriendRemovalAttempt) => void,
    ) {
      const state = prepare(friendshipId);
      if (state.inFlight) return state.inFlight as Promise<Result>;

      const promise = Promise.resolve()
        .then(() => deliver(state.attempt))
        .then(
          (result) => {
            if (pending.get(friendshipId) === state) {
              commit?.(result, state.attempt);
              pending.delete(friendshipId);
            }
            return result;
          },
          (error: unknown) => {
            state.inFlight = null;
            if (!outcomeMayHaveCommitted(error)
              && pending.get(friendshipId) === state) {
              pending.delete(friendshipId);
            }
            throw error;
          },
        );
      state.inFlight = promise;
      return promise;
    },
    peek(friendshipId) {
      return pending.get(friendshipId)?.attempt ?? null;
    },
    discard(friendshipId) {
      const state = pending.get(friendshipId);
      if (!state) return true;
      if (state.inFlight) return false;
      pending.delete(friendshipId);
      return true;
    },
    reset() {
      pending.clear();
    },
  };
}
