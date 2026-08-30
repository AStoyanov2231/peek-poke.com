import { idempotencyKeySchema } from "./contract";
import { ApiTransportError } from "./errors";

export type BlockUserAttempt = Readonly<{
  key: string;
  targetUserId: string;
}>;

export type BlockUserAttemptCoordinator = {
  run: <Result>(
    targetUserId: string,
    deliver: (attempt: BlockUserAttempt) => Promise<Result>,
    commit?: (result: Result, attempt: BlockUserAttempt) => void,
  ) => Promise<Result>;
  peek: (targetUserId: string) => BlockUserAttempt | null;
  discard: (targetUserId: string) => boolean;
  reset: () => void;
};

function outcomeMayHaveCommitted(error: unknown) {
  return error instanceof ApiTransportError
    && (
      error.status === 0
      || error.code === "INVALID_RESPONSE"
      || error.code === "BLOCK_IDEMPOTENCY_UNAVAILABLE"
    );
}

export function createBlockUserAttemptCoordinator(
  createKey: () => string,
): BlockUserAttemptCoordinator {
  const pending = new Map<string, {
    attempt: BlockUserAttempt;
    inFlight: Promise<unknown> | null;
  }>();

  function prepare(targetUserId: string) {
    const existing = pending.get(targetUserId);
    if (existing) return existing;

    const key = idempotencyKeySchema.parse(createKey());
    const attempt = Object.freeze({ key, targetUserId });
    const state = { attempt, inFlight: null };
    pending.set(targetUserId, state);
    return state;
  }

  return {
    run<Result>(
      targetUserId: string,
      deliver: (attempt: BlockUserAttempt) => Promise<Result>,
      commit?: (result: Result, attempt: BlockUserAttempt) => void,
    ) {
      const state = prepare(targetUserId);
      if (state.inFlight) return state.inFlight as Promise<Result>;

      const promise = Promise.resolve()
        .then(() => deliver(state.attempt))
        .then(
          (result) => {
            if (pending.get(targetUserId) === state) {
              commit?.(result, state.attempt);
              pending.delete(targetUserId);
            }
            return result;
          },
          (error: unknown) => {
            state.inFlight = null;
            if (!outcomeMayHaveCommitted(error)
              && pending.get(targetUserId) === state) {
              pending.delete(targetUserId);
            }
            throw error;
          },
        );
      state.inFlight = promise;
      return promise;
    },
    peek(targetUserId) {
      return pending.get(targetUserId)?.attempt ?? null;
    },
    discard(targetUserId) {
      const state = pending.get(targetUserId);
      if (!state) return true;
      if (state.inFlight) return false;
      pending.delete(targetUserId);
      return true;
    },
    reset() {
      pending.clear();
    },
  };
}
