import {
  friendshipResponseRequestSchema,
  idempotencyKeySchema,
  type FriendshipResponseRequest,
} from "./contract";
import { ApiTransportError } from "./errors";

export type FriendResponseAttempt = Readonly<{
  key: string;
  friendshipId: string;
  status: FriendshipResponseRequest["status"];
  body: Readonly<FriendshipResponseRequest>;
  serializedBody: string;
}>;

export type FriendResponseAttemptCoordinator = {
  run: <Result>(
    friendshipId: string,
    status: FriendshipResponseRequest["status"],
    deliver: (attempt: FriendResponseAttempt) => Promise<Result>,
    commit?: (result: Result, attempt: FriendResponseAttempt) => void,
  ) => Promise<Result>;
  peek: (friendshipId: string) => FriendResponseAttempt | null;
  cancel: (friendshipId: string) => boolean;
  reset: () => void;
};

function outcomeMayHaveCommitted(error: unknown) {
  return error instanceof ApiTransportError
    && (
      error.status === 0
      || error.code === "INVALID_RESPONSE"
      || error.code === "FRIEND_RESPONSE_IDEMPOTENCY_UNAVAILABLE"
    );
}

export function createFriendResponseAttemptCoordinator(
  createKey: () => string,
): FriendResponseAttemptCoordinator {
  const pending = new Map<string, {
    attempt: FriendResponseAttempt;
    inFlight: Promise<unknown> | null;
    uncertain: boolean;
  }>();

  function prepare(friendshipId: string, status: FriendshipResponseRequest["status"]) {
    const body = friendshipResponseRequestSchema.parse({ status });
    const existing = pending.get(friendshipId);
    if (existing) {
      if (existing.attempt.status !== body.status) {
        throw new ApiTransportError(
          "Recover the previous friend response before changing the action",
          409,
          "FRIEND_RESPONSE_ATTEMPT_PENDING",
        );
      }
      return existing;
    }

    const key = idempotencyKeySchema.parse(createKey());
    const attempt = Object.freeze({
      key,
      friendshipId,
      status: body.status,
      body: Object.freeze(body),
      serializedBody: JSON.stringify(body),
    });
    const state = { attempt, inFlight: null, uncertain: false };
    pending.set(friendshipId, state);
    return state;
  }

  return {
    run<Result>(
      friendshipId: string,
      status: FriendshipResponseRequest["status"],
      deliver: (attempt: FriendResponseAttempt) => Promise<Result>,
      commit?: (result: Result, attempt: FriendResponseAttempt) => void,
    ) {
      let state: ReturnType<typeof prepare>;
      try {
        state = prepare(friendshipId, status);
      } catch (error) {
        return Promise.reject(error);
      }
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
            state.uncertain = outcomeMayHaveCommitted(error);
            if (!state.uncertain && pending.get(friendshipId) === state) {
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
    cancel(friendshipId) {
      const state = pending.get(friendshipId);
      if (!state) return true;
      if (state.inFlight || state.uncertain) return false;
      pending.delete(friendshipId);
      return true;
    },
    reset() {
      pending.clear();
    },
  };
}
