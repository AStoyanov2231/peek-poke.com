export type ReadReceiptOwnerToken = Readonly<{
  accountId: string;
  threadId: string;
  generation: number;
}>;

export class StaleReadReceiptError extends Error {
  readonly code = "READ_RECEIPT_STALE";

  constructor() {
    super("Read receipt belongs to an inactive authentication or thread generation");
    this.name = "AbortError";
  }
}

export function createReadReceiptCoordinator() {
  let accountId: string | null = null;
  let activeToken: ReadReceiptOwnerToken | null = null;
  let generation = 0;
  let inFlight: {
    token: ReadReceiptOwnerToken;
    controller: AbortController;
    promise: Promise<unknown>;
  } | null = null;

  const isCurrent = (token: ReadReceiptOwnerToken) => (
    activeToken === token
    && accountId === token.accountId
    && token.generation === generation
  );

  const fence = () => {
    generation += 1;
    activeToken = null;
    inFlight?.controller.abort(new StaleReadReceiptError());
    inFlight = null;
  };

  return {
    observeAccount(nextAccountId: string | null) {
      if (accountId === nextAccountId) return;
      fence();
      accountId = nextAccountId;
    },
    activateThread(nextAccountId: string, threadId: string) {
      if (accountId !== nextAccountId) return null;
      if (
        activeToken?.accountId === nextAccountId
        && activeToken.threadId === threadId
      ) return activeToken;
      fence();
      activeToken = Object.freeze({
        accountId: nextAccountId,
        threadId,
        generation,
      });
      return activeToken;
    },
    current(nextAccountId: string, threadId: string) {
      return activeToken?.accountId === nextAccountId && activeToken.threadId === threadId
        ? activeToken
        : null;
    },
    isCurrent,
    deactivateThread(token: ReadReceiptOwnerToken) {
      if (!isCurrent(token)) return false;
      fence();
      return true;
    },
    run<Result>(
      token: ReadReceiptOwnerToken,
      deliver: (signal: AbortSignal) => Promise<Result>,
    ): Promise<Result> {
      if (!isCurrent(token)) return Promise.reject(new StaleReadReceiptError());
      if (inFlight?.token === token) return inFlight.promise as Promise<Result>;

      const controller = new AbortController();
      const promise = Promise.resolve()
        .then(() => deliver(controller.signal))
        .then(
          (result) => {
            if (!isCurrent(token)) throw new StaleReadReceiptError();
            return result;
          },
          (error: unknown) => {
            if (!isCurrent(token)) throw new StaleReadReceiptError();
            throw error;
          },
        )
        .finally(() => {
          if (inFlight?.promise === promise) inFlight = null;
        });
      inFlight = { token, controller, promise };
      return promise;
    },
  };
}
