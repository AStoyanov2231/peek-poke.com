import { friendshipCreateRequestSchema, idempotencyKeySchema } from "./contract";
import { ApiTransportError } from "./errors";

export type FriendRequestAttempt = Readonly<{
  key: string;
  addresseeId: string;
  body: Readonly<{ addressee_id: string }>;
  serializedBody: string;
}>;

export type FriendRequestAttemptCoordinator = {
  run: <Result>(
    addresseeId: string,
    deliver: (attempt: FriendRequestAttempt) => Promise<Result>,
    commit?: (result: Result, attempt: FriendRequestAttempt) => void,
  ) => Promise<Result>;
  peek: (addresseeId: string) => FriendRequestAttempt | null;
  cancel: (addresseeId: string) => boolean;
  reset: () => void;
};

function outcomeMayHaveCommitted(error: unknown) {
  return error instanceof ApiTransportError
    && (
      error.status === 0
      || error.code === "INVALID_RESPONSE"
      // The route uses this code when the service-role RPC transport fails.
      // The database transaction may already have committed before that
      // response was lost, so a new key would turn recovery into ALREADY_PENDING.
      || error.code === "FRIEND_REQUEST_IDEMPOTENCY_UNAVAILABLE"
    );
}

export function createFriendRequestAttemptCoordinator(
  createKey: () => string,
): FriendRequestAttemptCoordinator {
  const pending = new Map<string, {
    attempt: FriendRequestAttempt;
    inFlight: Promise<unknown> | null;
  }>();

  function prepare(addresseeId: string) {
    const body = friendshipCreateRequestSchema.parse({ addressee_id: addresseeId });
    const existing = pending.get(body.addressee_id);
    if (existing) return existing;

    const key = idempotencyKeySchema.parse(createKey());
    const attempt = Object.freeze({
      key,
      addresseeId: body.addressee_id,
      body: Object.freeze(body),
      serializedBody: JSON.stringify(body),
    });
    const state = { attempt, inFlight: null };
    pending.set(body.addressee_id, state);
    return state;
  }

  return {
    run<Result>(
      addresseeId: string,
      deliver: (attempt: FriendRequestAttempt) => Promise<Result>,
      commit?: (result: Result, attempt: FriendRequestAttempt) => void,
    ) {
      const state = prepare(addresseeId);
      if (state.inFlight) return state.inFlight as Promise<Result>;

      const promise = Promise.resolve()
        .then(() => deliver(state.attempt))
        .then(
          (result) => {
            commit?.(result, state.attempt);
            if (pending.get(state.attempt.addresseeId) === state) {
              pending.delete(state.attempt.addresseeId);
            }
            return result;
          },
          (error: unknown) => {
            state.inFlight = null;
            if (!outcomeMayHaveCommitted(error)
              && pending.get(state.attempt.addresseeId) === state) {
              pending.delete(state.attempt.addresseeId);
            }
            throw error;
          },
        );
      state.inFlight = promise;
      return promise;
    },
    peek(addresseeId) {
      return pending.get(addresseeId)?.attempt ?? null;
    },
    cancel(addresseeId) {
      const state = pending.get(addresseeId);
      if (!state) return true;
      if (state.inFlight) return false;
      pending.delete(addresseeId);
      return true;
    },
    reset() {
      pending.clear();
    },
  };
}
