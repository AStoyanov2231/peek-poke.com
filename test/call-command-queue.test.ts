import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CALL_TERMINAL_AUTHORITY_TIMEOUT_MS,
  CALL_TERMINAL_TIMEOUT_MS,
  CallCommandSupersededError,
  CallTerminalAuthorityTimeoutError,
  CallTerminalRecoveryUnavailableError,
  CallTerminalTimeoutError,
  StaleCallCommandError,
  createCallCommandQueue,
  type CallSignalAck,
  type CallSignalCommand,
} from "@peekpoke/shared";

const CALL = "44444444-4444-4444-8444-444444444444";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const ACCEPT_ID = "66666666-6666-4666-8666-666666666666";
const END_ID = "77777777-7777-4777-8777-777777777777";
const REJECT_ID = "88888888-8888-4888-8888-888888888888";
const INVITE_ID = "99999999-9999-4999-8999-999999999999";
const RECOVER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function ack(sequence: number): CallSignalAck {
  return {
    version: 1,
    callId: CALL,
    threadId: THREAD,
    capability: CAPABILITY,
    acceptedSequence: sequence,
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
    replayed: false,
  };
}

function accept(): CallSignalCommand {
  return {
    version: 1,
    type: "accept",
    commandId: ACCEPT_ID,
    callId: CALL,
    capability: CAPABILITY,
  };
}

function end(): CallSignalCommand {
  return {
    version: 1,
    type: "end",
    commandId: END_ID,
    callId: CALL,
    capability: CAPABILITY,
  };
}

function reject(): CallSignalCommand {
  return {
    version: 1,
    type: "reject",
    commandId: REJECT_ID,
    callId: CALL,
    capability: CAPABILITY,
    reason: "declined",
  };
}

function invite(): CallSignalCommand {
  return {
    version: 1,
    type: "invite",
    commandId: INVITE_ID,
    callId: CALL,
  };
}

function recoverCancel(): CallSignalCommand {
  return {
    version: 1,
    type: "recover-cancel",
    commandId: RECOVER_ID,
    inviteCommandId: INVITE_ID,
    callId: CALL,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const authorityFailureCases = (["pre-factory", "between-candidates", "post-response"] as const)
  .flatMap((phase) => (["reject", "throw", "hang"] as const)
    .flatMap((mode) => ([true, false] as const).map((stale) => ({ phase, mode, stale }))));

function createTestQueue(options: {
  dispatch: (command: CallSignalCommand, signal: AbortSignal) => Promise<CallSignalAck>;
  isCurrent: () => boolean;
  isAuthorityCurrent?: () => boolean;
  mayDispatch?: (candidate: CallSignalCommand | null) => boolean | Promise<boolean>;
  isConflict: (error: unknown) => boolean;
  observeAck: (acknowledgement: CallSignalAck, command: CallSignalCommand, commit: boolean) => void;
  onTerminated: (
    acknowledgement: CallSignalAck | null,
    command: CallSignalCommand | null,
    wasCurrent: boolean,
  ) => void;
  onTerminationStale?: (error: StaleCallCommandError) => void;
  onTerminationError: (error: unknown) => void;
}) {
  const queue = createCallCommandQueue({
    dispatch: options.dispatch,
    isConflict: options.isConflict,
  });
  return {
    enqueue: (createCommand: () => CallSignalCommand) => queue.enqueue(createCommand, {
      isCurrent: options.isCurrent,
      observeAck: options.observeAck,
    }),
    requestTermination: (createCandidates: () => CallSignalCommand[]) =>
      queue.requestTermination(createCandidates, {
        isCurrent: options.isCurrent,
        isAuthorityCurrent: options.isAuthorityCurrent ?? options.isCurrent,
        mayDispatch: options.mayDispatch ?? options.isCurrent,
        observeAck: options.observeAck,
        onTerminationStale: options.onTerminationStale ?? vi.fn(),
        onTerminated: options.onTerminated,
        onTerminationError: options.onTerminationError,
      }),
  };
}

describe("call command terminal sequencing", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for an in-flight accept, suppresses its store commit, then ends the accepted call", async () => {
    const pendingAccept = deferred<CallSignalAck>();
    const order: string[] = [];
    const storeCommits: boolean[] = [];
    let callerActive = false;
    const dispatch = vi.fn(async (command: CallSignalCommand) => {
      order.push(command.type);
      if (command.type === "accept") {
        const result = await pendingAccept.promise;
        callerActive = true;
        return result;
      }
      if (command.type === "end") callerActive = false;
      return ack(3);
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: (_result, command, commit) => {
        if (command.type === "accept") storeCommits.push(commit);
      },
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const accepting = queue.enqueue(accept);
    await Promise.resolve();
    const terminating = queue.requestTermination(() => [end(), reject()]);
    pendingAccept.resolve(ack(2));

    await expect(accepting).rejects.toBeInstanceOf(CallCommandSupersededError);
    await expect(terminating).resolves.toMatchObject({ acceptedSequence: 3 });
    expect(order).toEqual(["accept", "end"]);
    expect(storeCommits).toEqual([false]);
    expect(callerActive).toBe(false);
  });

  it("suppresses a queued accept and falls back from end to reject while still invited", async () => {
    const order: string[] = [];
    const conflict = new Error("409");
    const dispatch = vi.fn(async (command: CallSignalCommand) => {
      order.push(command.type);
      if (command.type === "end") throw conflict;
      return ack(2);
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: (error) => error === conflict,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const accepting = queue.enqueue(accept);
    const terminating = queue.requestTermination(() => [end(), reject()]);

    await expect(accepting).rejects.toBeInstanceOf(CallCommandSupersededError);
    await expect(terminating).resolves.toMatchObject({ acceptedSequence: 2 });
    expect(order).toEqual(["end", "reject"]);
  });

  it("never revives stale state after auth generation changes during accept", async () => {
    const pendingAccept = deferred<CallSignalAck>();
    let current = true;
    const commits: boolean[] = [];
    const terminated = vi.fn();
    const dispatch = vi.fn(async (command: CallSignalCommand) => {
      if (command.type === "accept") return pendingAccept.promise;
      return ack(3);
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => current,
      isConflict: () => false,
      observeAck: (_result, _command, commit) => commits.push(commit),
      onTerminated: terminated,
      onTerminationError: vi.fn(),
    });

    const accepting = queue.enqueue(accept);
    await Promise.resolve();
    const terminating = queue.requestTermination(() => [end()]);
    current = false;
    pendingAccept.resolve(ack(2));

    await expect(accepting).rejects.toThrow("Stale call session");
    await expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(commits).toEqual([false]);
    expect(terminated).not.toHaveBeenCalled();
  });

  it("does not dispatch a reject fallback after an external terminal fence lands during end", async () => {
    const conflict = new Error("409");
    let rejectEnd!: (error: unknown) => void;
    const pendingEnd = new Promise<CallSignalAck>((_resolve, reject) => { rejectEnd = reject; });
    const order: string[] = [];
    let current = true;
    let fenced = false;
    const onTerminated = vi.fn();
    const onTerminationError = vi.fn();
    const mayDispatch = vi.fn((_candidate: CallSignalCommand | null) => current && !fenced);
    const dispatch = vi.fn((command: CallSignalCommand) => {
      order.push(command.type);
      return command.type === "end" ? pendingEnd : Promise.resolve(ack(3));
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => current,
      mayDispatch,
      isConflict: (error) => error === conflict,
      observeAck: vi.fn(),
      onTerminated,
      onTerminationError,
    });

    const terminating = queue.requestTermination(() => [end(), reject()]);
    const duplicate = queue.requestTermination(() => [end(), reject()]);
    expect(duplicate).toBe(terminating);
    await vi.waitFor(() => expect(order).toEqual(["end"]));
    const result = expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError);
    fenced = true;
    current = false;
    rejectEnd(conflict);

    await result;
    expect(order).toEqual(["end"]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(mayDispatch.mock.calls.map(([candidate]) => candidate?.type ?? null))
      .toEqual([null, "end", "end"]);
    expect(onTerminated).not.toHaveBeenCalled();
    expect(onTerminationError).not.toHaveBeenCalled();
  });

  it("does not build terminal candidates when authority becomes stale before the factory", async () => {
    const authority = deferred<boolean>();
    const createCandidates = vi.fn(() => [end()]);
    const dispatch = vi.fn(async () => ack(2));
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      mayDispatch: (candidate) => candidate === null ? authority.promise : true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const terminating = queue.requestTermination(createCandidates);
    const result = expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError);
    authority.resolve(false);

    await result;
    expect(createCandidates).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not report a stale successful terminal response as local success", async () => {
    const pendingEnd = deferred<CallSignalAck>();
    let fenced = false;
    const observeAck = vi.fn();
    const onTerminated = vi.fn();
    const onTerminationError = vi.fn();
    const dispatch = vi.fn(() => pendingEnd.promise);
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      mayDispatch: () => !fenced,
      isConflict: () => false,
      observeAck,
      onTerminated,
      onTerminationError,
    });

    const terminating = queue.requestTermination(() => [end()]);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    const result = expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError);
    fenced = true;
    pendingEnd.resolve(ack(2));

    await result;
    expect(observeAck).not.toHaveBeenCalled();
    expect(onTerminated).not.toHaveBeenCalled();
    expect(onTerminationError).not.toHaveBeenCalled();
  });

  it.each(authorityFailureCases)(
    "$mode authority failure at $phase is classified with stale=$stale and shared by duplicate callers",
    async ({ phase, mode, stale }) => {
      if (mode === "hang") vi.useFakeTimers();
      const infrastructureError = new Error(`authority ${mode}`);
      const conflict = new Error("409");
      const never = new Promise<boolean>(() => undefined);
      const targetCheck = phase === "pre-factory" ? 1 : phase === "post-response" ? 3 : 4;
      let authorityCurrent = true;
      let checkCount = 0;
      const mayDispatch = vi.fn((_candidate: CallSignalCommand | null) => {
        checkCount += 1;
        if (checkCount !== targetCheck) return true;
        if (stale) authorityCurrent = false;
        if (mode === "throw") throw infrastructureError;
        if (mode === "reject") return Promise.reject(infrastructureError);
        return never;
      });
      const dispatch = vi.fn(async (command: CallSignalCommand) => {
        if (phase === "between-candidates" && command.type === "end") throw conflict;
        return ack(2);
      });
      const createCandidates = vi.fn(() => phase === "between-candidates"
        ? [end(), reject()]
        : [end()]);
      const observeAck = vi.fn();
      const onTerminated = vi.fn();
      const onTerminationStale = vi.fn();
      const onTerminationError = vi.fn();
      const queue = createTestQueue({
        dispatch,
        isCurrent: () => true,
        isAuthorityCurrent: () => authorityCurrent,
        mayDispatch,
        isConflict: (error) => error === conflict,
        observeAck,
        onTerminated,
        onTerminationStale,
        onTerminationError,
      });

      const terminating = queue.requestTermination(createCandidates);
      const duplicate = queue.requestTermination(createCandidates);
      expect(duplicate).toBe(terminating);
      const expected = stale
        ? expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError)
        : mode === "hang"
          ? expect(terminating).rejects.toBeInstanceOf(CallTerminalAuthorityTimeoutError)
          : expect(terminating).rejects.toBe(infrastructureError);
      if (mode === "hang") {
        await vi.advanceTimersByTimeAsync(CALL_TERMINAL_AUTHORITY_TIMEOUT_MS + 25);
      }
      await expected;

      expect(checkCount).toBe(targetCheck);
      expect(createCandidates).toHaveBeenCalledTimes(phase === "pre-factory" ? 0 : 1);
      expect(dispatch).toHaveBeenCalledTimes(phase === "pre-factory" ? 0 : 1);
      expect(dispatch.mock.calls.map(([command]) => command.type))
        .toEqual(phase === "pre-factory" ? [] : ["end"]);
      expect(observeAck).not.toHaveBeenCalled();
      expect(onTerminated).not.toHaveBeenCalled();
      if (stale) {
        expect(onTerminationStale).toHaveBeenCalledOnce();
        expect(onTerminationStale).toHaveBeenCalledWith(expect.any(StaleCallCommandError));
        expect(onTerminationError).not.toHaveBeenCalled();
      } else {
        expect(onTerminationStale).not.toHaveBeenCalled();
        expect(onTerminationError).toHaveBeenCalledOnce();
        expect(onTerminationError).toHaveBeenCalledWith(
          mode === "hang" ? expect.any(CallTerminalAuthorityTimeoutError) : infrastructureError,
        );
      }
    },
  );

  it("deduplicates repeated teardown taps into one terminal request", async () => {
    const dispatch = vi.fn(async () => ack(2));
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const first = queue.requestTermination(() => [end()]);
    const second = queue.requestTermination(() => [end()]);
    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ acceptedSequence: 2 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("reports the final bounded recovery failure instead of swallowing it", async () => {
    const conflict = new Error("409");
    const unavailable = new Error("offline");
    const onTerminationError = vi.fn();
    const dispatch = vi.fn(async (command: CallSignalCommand) => {
      if (command.type === "end") throw conflict;
      throw unavailable;
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: (error) => error === conflict,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError,
    });

    await expect(queue.requestTermination(() => [end(), reject()])).rejects.toBe(unavailable);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(onTerminationError).toHaveBeenCalledOnce();
    expect(onTerminationError).toHaveBeenCalledWith(unavailable);
  });

  it("cancels a committed invite when its capability acknowledgement is lost", async () => {
    const order: string[] = [];
    let remoteRinging = false;
    const terminated = vi.fn();
    const dispatch = vi.fn((command: CallSignalCommand, signal: AbortSignal) => {
      order.push(command.type);
      if (command.type === "invite") {
        remoteRinging = true;
        return new Promise<CallSignalAck>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      expect(command).toEqual(recoverCancel());
      remoteRinging = false;
      return Promise.resolve(ack(2));
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: terminated,
      onTerminationError: vi.fn(),
    });

    const inviting = queue.enqueue(invite);
    await Promise.resolve();
    expect(remoteRinging).toBe(true);
    const inviteResult = expect(inviting).rejects.toBeInstanceOf(CallCommandSupersededError);
    const terminating = queue.requestTermination(() => [recoverCancel()]);

    await inviteResult;
    await expect(terminating).resolves.toMatchObject({ acceptedSequence: 2 });
    expect(order).toEqual(["invite", "recover-cancel"]);
    expect(remoteRinging).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(terminated).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedSequence: 2 }),
      recoverCancel(),
      true,
    );
  });

  it("surfaces a missing terminal recovery command instead of clearing local state", async () => {
    const onTerminated = vi.fn();
    const onTerminationError = vi.fn();
    const queue = createTestQueue({
      dispatch: vi.fn(async () => ack(2)),
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated,
      onTerminationError,
    });

    await expect(queue.requestTermination(() => []))
      .rejects.toBeInstanceOf(CallTerminalRecoveryUnavailableError);
    expect(onTerminated).not.toHaveBeenCalled();
    expect(onTerminationError.mock.calls[0]?.[0])
      .toBeInstanceOf(CallTerminalRecoveryUnavailableError);
  });

  it.each(["accept", "ice", "heartbeat"] as const)(
    "aborts a never-resolving %s command and dispatches valid terminal compensation",
    async (type) => {
      const order: string[] = [];
      const commits: boolean[] = [];
      const dispatch = vi.fn((command: CallSignalCommand, signal: AbortSignal) => {
        order.push(command.type);
        if (command.type === "end") return Promise.resolve(ack(4));
        return new Promise<CallSignalAck>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      });
      const queue = createTestQueue({
        dispatch,
        isCurrent: () => true,
        isConflict: () => false,
        observeAck: (_result, _command, commit) => commits.push(commit),
        onTerminated: vi.fn(),
        onTerminationError: vi.fn(),
      });
      const command = type === "accept"
        ? accept()
        : type === "heartbeat"
          ? {
              version: 1 as const,
              type,
              commandId: ACCEPT_ID,
              callId: CALL,
              capability: CAPABILITY,
            }
          : {
              version: 1 as const,
              type,
              commandId: ACCEPT_ID,
              callId: CALL,
              capability: CAPABILITY,
              candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ host" },
            };

      const stalled = queue.enqueue(() => command);
      await Promise.resolve();
      const stalledResult = expect(stalled).rejects.toBeInstanceOf(CallCommandSupersededError);
      const terminating = queue.requestTermination(() => [end()]);

      await stalledResult;
      await expect(terminating).resolves.toMatchObject({ acceptedSequence: 4 });
      expect(order).toEqual([type, "end"]);
      expect(commits).toEqual([false]);
    },
  );

  it("runs valid compensation after a normal command exhausts its own timeout", async () => {
    vi.useFakeTimers();
    const timeout = new Error("command timeout");
    const order: string[] = [];
    const dispatch = vi.fn((command: CallSignalCommand) => {
      order.push(command.type);
      if (command.type === "end") return Promise.resolve(ack(3));
      return new Promise<CallSignalAck>((_resolve, reject) => {
        setTimeout(() => reject(timeout), 100);
      });
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const stalled = queue.enqueue(accept);
    const stalledResult = expect(stalled).rejects.toBe(timeout);
    await vi.advanceTimersByTimeAsync(100);
    await stalledResult;
    await expect(queue.requestTermination(() => [end()])).resolves.toMatchObject({
      acceptedSequence: 3,
    });
    expect(order).toEqual(["accept", "end"]);
  });

  it("settles a fallback that ignores abort at the overall terminal deadline", async () => {
    vi.useFakeTimers();
    const onTerminationError = vi.fn();
    const dispatch = vi.fn(() => new Promise<CallSignalAck>(() => undefined));
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError,
    });

    const terminating = queue.requestTermination(() => [end(), reject()]);
    const timedOut = expect(terminating).rejects.toBeInstanceOf(CallTerminalTimeoutError);
    await vi.advanceTimersByTimeAsync(CALL_TERMINAL_TIMEOUT_MS);

    await timedOut;
    expect(onTerminationError).toHaveBeenCalledOnce();
    expect(onTerminationError.mock.calls[0]?.[0]).toBeInstanceOf(CallTerminalTimeoutError);
  });
});
