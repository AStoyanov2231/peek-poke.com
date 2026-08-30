import type { CallSignalAck, CallSignalCommand } from "./call-signaling";

export class CallCommandSupersededError extends Error {
  constructor() {
    super("Call command superseded by terminal intent");
    this.name = "CallCommandSupersededError";
  }
}

export class StaleCallCommandError extends Error {
  constructor() {
    super("Stale call session");
    this.name = "StaleCallCommandError";
  }
}

export class CallTerminalTimeoutError extends Error {
  constructor() {
    super("Call terminal recovery timed out");
    this.name = "CallTerminalTimeoutError";
  }
}

export class CallTerminalAuthorityTimeoutError extends Error {
  constructor() {
    super("Call terminal authority check timed out");
    this.name = "CallTerminalAuthorityTimeoutError";
  }
}

export class CallTerminalRecoveryUnavailableError extends Error {
  constructor() {
    super("Call terminal recovery command is unavailable");
    this.name = "CallTerminalRecoveryUnavailableError";
  }
}

export const CALL_TERMINAL_TIMEOUT_MS = 20_000;
export const CALL_TERMINAL_AUTHORITY_TIMEOUT_MS = 2_000;
const TERMINAL_QUEUE_DRAIN_MS = 25;

type QueueOptions = {
  dispatch: (command: CallSignalCommand, signal: AbortSignal) => Promise<CallSignalAck>;
  isConflict: (error: unknown) => boolean;
};

type CommandLifecycle = {
  isCurrent: () => boolean;
  observeAck: (
    acknowledgement: CallSignalAck,
    command: CallSignalCommand,
    commitToCurrentStore: boolean,
  ) => void;
};

type TerminalLifecycle = CommandLifecycle & {
  isAuthorityCurrent: () => boolean;
  mayDispatch: (candidate: CallSignalCommand | null) => boolean | Promise<boolean>;
  onTerminationStale: (error: StaleCallCommandError) => void;
  onTerminated: (
    acknowledgement: CallSignalAck | null,
    command: CallSignalCommand | null,
    wasCurrent: boolean,
  ) => void;
  onTerminationError: (error: unknown) => void;
};

export function createCallCommandQueue(options: QueueOptions) {
  let tail: Promise<unknown> = Promise.resolve();
  let terminalIntent = false;
  let terminalPromise: Promise<CallSignalAck | null> | null = null;
  let activeCommandController: AbortController | null = null;

  const schedule = <T>(operation: () => Promise<T>) => {
    const scheduled = tail.then(operation);
    tail = scheduled.catch(() => undefined);
    return scheduled;
  };

  const enqueue = (
    createCommand: () => CallSignalCommand,
    lifecycle: CommandLifecycle,
  ) => {
    if (terminalIntent) return Promise.reject(new CallCommandSupersededError());
    return schedule(async () => {
      if (terminalIntent) throw new CallCommandSupersededError();
      if (!lifecycle.isCurrent()) throw new StaleCallCommandError();
      const command = createCommand();
      const commandController = new AbortController();
      activeCommandController = commandController;
      let acknowledgement: CallSignalAck;
      try {
        acknowledgement = await options.dispatch(command, commandController.signal);
      } finally {
        if (activeCommandController === commandController) activeCommandController = null;
      }
      const current = lifecycle.isCurrent();
      lifecycle.observeAck(acknowledgement, command, current && !terminalIntent);
      if (!current) throw new StaleCallCommandError();
      if (terminalIntent) throw new CallCommandSupersededError();
      return acknowledgement;
    });
  };

  const requestTermination = (
    createCandidates: () => CallSignalCommand[],
    lifecycle: TerminalLifecycle,
  ) => {
    terminalIntent = true;
    if (terminalPromise) return terminalPromise;
    activeCommandController?.abort(new CallCommandSupersededError());

    const terminalController = new AbortController();
    const terminalTimeout = setTimeout(() => {
      terminalController.abort(new CallTerminalTimeoutError());
    }, CALL_TERMINAL_TIMEOUT_MS);

    const authorityIsCurrent = () => {
      try {
        return lifecycle.isAuthorityCurrent();
      } catch {
        // A broken snapshot cannot prove the call is stale. Preserve the
        // original authority failure so the owning call reports it once.
        return true;
      }
    };

    const assertMayDispatch = async (candidate: CallSignalCommand | null) => {
      try {
        const mayDispatch = await raceWithTimeoutAndAbort(
          Promise.resolve().then(() => lifecycle.mayDispatch(candidate)),
          terminalController.signal,
          CALL_TERMINAL_AUTHORITY_TIMEOUT_MS,
          new CallTerminalAuthorityTimeoutError(),
        );
        if (!mayDispatch) throw new StaleCallCommandError();
      } catch (error) {
        if (error instanceof StaleCallCommandError) throw error;
        if (!authorityIsCurrent()) throw new StaleCallCommandError();
        throw error;
      }
    };

    terminalPromise = (async () => {
      try {
        await new Promise<void>((resolve) => {
          const drainTimeout = setTimeout(resolve, TERMINAL_QUEUE_DRAIN_MS);
          void tail.then(() => {
            clearTimeout(drainTimeout);
            resolve();
          });
        });

        await assertMayDispatch(null);
        const candidates = createCandidates();
        if (candidates.length === 0) {
          throw new CallTerminalRecoveryUnavailableError();
        }

        let lastError: unknown;
        for (let index = 0; index < candidates.length; index += 1) {
          const command = candidates[index]!;
          await assertMayDispatch(command);
          let acknowledgement: CallSignalAck;
          try {
            acknowledgement = await raceWithAbort(
              options.dispatch(command, terminalController.signal),
              terminalController.signal,
            );
          } catch (error) {
            await assertMayDispatch(command);
            lastError = error;
            if (index + 1 < candidates.length && options.isConflict(error)) continue;
            throw error;
          }
          await assertMayDispatch(command);
          const current = lifecycle.isCurrent();
          lifecycle.observeAck(acknowledgement, command, false);
          lifecycle.onTerminated(acknowledgement, command, current);
          return acknowledgement;
        }
        throw lastError;
      } catch (error) {
        if (error instanceof StaleCallCommandError) {
          lifecycle.onTerminationStale(error);
          throw error;
        }
        if (!authorityIsCurrent()) {
          const staleError = new StaleCallCommandError();
          lifecycle.onTerminationStale(staleError);
          throw staleError;
        }
        lifecycle.onTerminationError(error);
        throw error;
      } finally {
        clearTimeout(terminalTimeout);
      }
    })();
    return terminalPromise;
  };

  return {
    enqueue,
    requestTermination,
    hasTerminalIntent: () => terminalIntent,
  };
}

function raceWithTimeoutAndAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  timeoutError: Error,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const bounded = Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(timeoutError), timeoutMs);
    }),
  ]);
  return raceWithAbort(bounded, signal).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new CallTerminalTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new CallTerminalTimeoutError());
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

export type CallCommandQueue = ReturnType<typeof createCallCommandQueue>;
