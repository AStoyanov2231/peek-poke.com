import {
  idempotencyKeySchema,
  meetingRequestSchema,
  type MeetingResponse,
} from "./contract";
import { ApiTransportError } from "./errors";

export type MeetingAttempt = Readonly<{
  key: string;
  accountId: string;
  friendId: string;
  serializedBody: string;
}>;

/** A validated success means the canonical pair row exists, even when a capped wallet earns no coin. */
export function meetingResponseCompletesPair(response: MeetingResponse): true {
  return response.success;
}

export const MEETING_COMPLETION_REGISTRY_LIMIT = 256;

export type MeetingCompletionEpoch = Readonly<{
  accountId: string;
  generation: number;
  globalGeneration: number;
}>;

export type MeetingCompletionRegistry = {
  activate: (accountId: string) => Readonly<{
    epoch: MeetingCompletionEpoch;
    previousAccountId: string | null;
  }>;
  current: (accountId: string) => MeetingCompletionEpoch | null;
  has: (epoch: MeetingCompletionEpoch, friendId: string) => boolean;
  mark: (epoch: MeetingCompletionEpoch, friendId: string) => boolean;
  isCurrent: (epoch: MeetingCompletionEpoch) => boolean;
  clear: (accountId?: string) => void;
  size: () => number;
};

export class StaleMeetingAttemptError extends Error {
  readonly code = "MEETING_ATTEMPT_STALE";

  constructor() {
    super("Meeting attempt belongs to an inactive authentication generation");
    this.name = "AbortError";
  }
}

/**
 * Memory-only app-lifecycle completion cache. A process restart may issue one
 * safe authoritative probe, which the server answers as already_met.
 */
export function createMeetingCompletionRegistry(
  limit = MEETING_COMPLETION_REGISTRY_LIMIT,
): MeetingCompletionRegistry {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Meeting completion registry limit must be a positive integer");
  }
  const completed = new Map<string, Readonly<{ accountId: string; friendId: string }>>();
  const ownerGenerations = new Map<string, number>();
  let activeAccountId: string | null = null;
  let globalGeneration = 0;

  function canonicalAccountId(accountId: string) {
    return meetingRequestSchema.parse({ friend_id: accountId }).friend_id;
  }

  function canonicalIdentity(accountId: string, friendId: string) {
    const ownerId = canonicalAccountId(accountId);
    const canonicalFriendId = meetingRequestSchema.parse({ friend_id: friendId }).friend_id;
    return {
      accountId: ownerId,
      friendId: canonicalFriendId,
      identity: attemptIdentity(ownerId, canonicalFriendId),
    };
  }

  function generationFor(accountId: string) {
    return ownerGenerations.get(accountId) ?? 0;
  }

  function bump(accountId: string) {
    ownerGenerations.set(accountId, generationFor(accountId) + 1);
  }

  function isCurrent(epoch: MeetingCompletionEpoch) {
    return activeAccountId === epoch.accountId
      && globalGeneration === epoch.globalGeneration
      && generationFor(epoch.accountId) === epoch.generation;
  }

  return {
    activate(accountId) {
      const ownerId = canonicalAccountId(accountId);
      const previousAccountId = activeAccountId !== ownerId ? activeAccountId : null;
      if (previousAccountId) bump(previousAccountId);
      activeAccountId = ownerId;
      return Object.freeze({
        epoch: Object.freeze({
          accountId: ownerId,
          generation: generationFor(ownerId),
          globalGeneration,
        }),
        previousAccountId,
      });
    },
    current(accountId) {
      const ownerId = canonicalAccountId(accountId);
      if (activeAccountId !== ownerId) return null;
      return Object.freeze({
        accountId: ownerId,
        generation: generationFor(ownerId),
        globalGeneration,
      });
    },
    has(epoch, friendId) {
      if (!isCurrent(epoch)) return false;
      const { identity } = canonicalIdentity(epoch.accountId, friendId);
      const entry = completed.get(identity);
      if (!entry) return false;
      completed.delete(identity);
      completed.set(identity, entry);
      return true;
    },
    mark(epoch, friendId) {
      if (!isCurrent(epoch)) return false;
      const entry = canonicalIdentity(epoch.accountId, friendId);
      completed.delete(entry.identity);
      completed.set(entry.identity, Object.freeze({
        accountId: entry.accountId,
        friendId: entry.friendId,
      }));
      while (completed.size > limit) {
        const oldest = completed.keys().next().value;
        if (oldest === undefined) break;
        completed.delete(oldest);
      }
      return true;
    },
    isCurrent,
    clear(accountId) {
      if (accountId === undefined) {
        globalGeneration += 1;
        activeAccountId = null;
        completed.clear();
        return;
      }
      const ownerId = canonicalAccountId(accountId);
      bump(ownerId);
      if (activeAccountId === ownerId) activeAccountId = null;
      for (const [identity, entry] of completed) {
        if (entry.accountId === ownerId) completed.delete(identity);
      }
    },
    size() {
      return completed.size;
    },
  };
}

export type MeetingAttemptCoordinator = {
  run: <Result>(
    accountId: string,
    friendId: string,
    deliver: (attempt: MeetingAttempt) => Promise<Result>,
    commit?: (result: Result, attempt: MeetingAttempt) => void,
    consumerId?: PropertyKey,
  ) => Promise<Result>;
  peek: (accountId: string, friendId: string) => MeetingAttempt | null;
  unsubscribe: (accountId: string, friendId: string, consumerId: PropertyKey) => boolean;
  discard: (accountId: string, friendId: string) => boolean;
  fence: (accountId?: string) => void;
  reset: (accountId?: string) => void;
};

function attemptIdentity(accountId: string, friendId: string) {
  return `${accountId}:${friendId}`;
}

function outcomeMayHaveCommitted(error: unknown) {
  return error instanceof ApiTransportError
    && (
      error.status === 0
      || error.code === "INVALID_RESPONSE"
      || error.code === "MEETING_IDEMPOTENCY_UNAVAILABLE"
    );
}

export function createMeetingAttemptCoordinator(
  createKey: () => string,
): MeetingAttemptCoordinator {
  const pending = new Map<string, {
    attempt: MeetingAttempt;
    inFlight: Promise<unknown> | null;
    listeners: Map<unknown, (result: unknown, attempt: MeetingAttempt) => void>;
  }>();

  function prepare(accountId: string, friendId: string) {
    const body = meetingRequestSchema.parse({ friend_id: friendId });
    const identity = attemptIdentity(accountId, body.friend_id);
    const existing = pending.get(identity);
    if (existing) return existing;
    const attempt = Object.freeze({
      key: idempotencyKeySchema.parse(createKey()),
      accountId,
      friendId: body.friend_id,
      serializedBody: JSON.stringify(body),
    });
    const state = {
      attempt,
      inFlight: null,
      listeners: new Map<unknown, (result: unknown, attempt: MeetingAttempt) => void>(),
    };
    pending.set(identity, state);
    return state;
  }

  return {
    run<Result>(
      accountId: string,
      friendId: string,
      deliver: (attempt: MeetingAttempt) => Promise<Result>,
      commit?: (result: Result, attempt: MeetingAttempt) => void,
      consumerId?: PropertyKey,
    ) {
      const identity = attemptIdentity(accountId, friendId);
      const state = prepare(accountId, friendId);
      if (commit) {
        state.listeners.set(
          consumerId ?? commit,
          commit as (result: unknown, attempt: MeetingAttempt) => void,
        );
      }
      if (state.inFlight) return state.inFlight as Promise<Result>;
      const promise = Promise.resolve()
        .then(() => deliver(state.attempt))
        .then(
          (result) => {
            if (pending.get(identity) === state) {
              const listeners = [...state.listeners.values()];
              state.listeners.clear();
              pending.delete(identity);
              for (const listener of listeners) {
                try {
                  listener(result, state.attempt);
                } catch (error) {
                  console.error("Meeting commit listener failed", error);
                }
              }
            }
            return result;
          },
          (error: unknown) => {
            state.inFlight = null;
            if (!outcomeMayHaveCommitted(error) && pending.get(identity) === state) {
              pending.delete(identity);
            }
            throw error;
          },
        );
      state.inFlight = promise;
      return promise;
    },
    peek(accountId, friendId) {
      return pending.get(attemptIdentity(accountId, friendId))?.attempt ?? null;
    },
    unsubscribe(accountId, friendId, consumerId) {
      const state = pending.get(attemptIdentity(accountId, friendId));
      if (!state) return true;
      state.listeners.delete(consumerId);
      return true;
    },
    discard(accountId, friendId) {
      const identity = attemptIdentity(accountId, friendId);
      const state = pending.get(identity);
      if (!state) return true;
      if (state.inFlight) return false;
      pending.delete(identity);
      return true;
    },
    fence(accountId) {
      for (const [identity, state] of pending) {
        if (accountId === undefined || state.attempt.accountId === accountId) {
          state.listeners.clear();
          pending.delete(identity);
        }
      }
    },
    reset(accountId) {
      for (const [identity, state] of pending) {
        if (state.inFlight) continue;
        if (accountId === undefined || state.attempt.accountId === accountId) {
          pending.delete(identity);
        }
      }
    },
  };
}
