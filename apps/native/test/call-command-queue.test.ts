import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CALL_TERMINAL_AUTHORITY_TIMEOUT_MS,
  CallCommandSupersededError,
  CallTerminalAuthorityTimeoutError,
  StaleCallCommandError,
  createCallCommandQueue,
  type CallSignalAck,
  type CallSignalCommand,
} from "@peekpoke/shared";

const CALL = "44444444-4444-4444-8444-444444444444";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const INVITE_COMMAND = "88888888-8888-4888-8888-888888888888";
const RECOVERY_COMMAND = "99999999-9999-4999-8999-999999999999";

const authorityFailureCases = (["pre-factory", "between-candidates", "post-response"] as const)
  .flatMap((phase) => (["reject", "throw", "hang"] as const)
    .flatMap((mode) => ([true, false] as const).map((stale) => ({ phase, mode, stale }))));

function acknowledgement(sequence: number): CallSignalAck {
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

const accept = (): CallSignalCommand => ({
  version: 1,
  type: "accept",
  commandId: "66666666-6666-4666-8666-666666666666",
  callId: CALL,
  capability: CAPABILITY,
});
const end = (): CallSignalCommand => ({
  version: 1,
  type: "end",
  commandId: "77777777-7777-4777-8777-777777777777",
  callId: CALL,
  capability: CAPABILITY,
});
const invite = (): CallSignalCommand => ({
  version: 1,
  type: "invite",
  commandId: INVITE_COMMAND,
  callId: CALL,
});
const recoverCancel = (): CallSignalCommand => ({
  version: 1,
  type: "recover-cancel",
  commandId: RECOVERY_COMMAND,
  inviteCommandId: INVITE_COMMAND,
  callId: CALL,
});

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

describe(`native terminal call sequencing (${process.env.NATIVE_TEST_PLATFORM ?? "shared"})`, () => {
  afterEach(() => vi.useRealTimers());

  it("serializes teardown behind accept without reviving a stale account generation", async () => {
    let resolveAccept!: (value: CallSignalAck) => void;
    const pendingAccept = new Promise<CallSignalAck>((resolve) => { resolveAccept = resolve; });
    let current = true;
    const order: string[] = [];
    const commits: boolean[] = [];
    const dispatch = vi.fn(async (command: CallSignalCommand) => {
      order.push(command.type);
      return command.type === "accept" ? pendingAccept : acknowledgement(3);
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => current,
      isConflict: () => false,
      observeAck: (_ack, _command, commit) => commits.push(commit),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const accepting = queue.enqueue(accept);
    await Promise.resolve();
    const firstTermination = queue.requestTermination(() => [end()]);
    const duplicateTermination = queue.requestTermination(() => [end()]);
    current = false;
    resolveAccept(acknowledgement(2));

    expect(duplicateTermination).toBe(firstTermination);
    await expect(accepting).rejects.toThrow("Stale call session");
    await expect(firstTermination).rejects.toBeInstanceOf(StaleCallCommandError);
    expect(order).toEqual(["accept"]);
    expect(commits).toEqual([false]);
  });

  it("does not dispatch a native reject fallback after a terminal fence lands during end", async () => {
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
      return command.type === "end" ? pendingEnd : Promise.resolve(acknowledgement(3));
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

    const terminating = queue.requestTermination(() => [end(), {
      ...end(),
      type: "reject",
      reason: "declined",
    }]);
    const duplicate = queue.requestTermination(() => [end()]);
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

  it("does not build native terminal candidates after authority becomes stale", async () => {
    let resolveAuthority!: (value: boolean) => void;
    const authority = new Promise<boolean>((resolve) => { resolveAuthority = resolve; });
    const createCandidates = vi.fn(() => [end()]);
    const dispatch = vi.fn(async () => acknowledgement(2));
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      mayDispatch: (candidate) => candidate === null ? authority : true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const terminating = queue.requestTermination(createCandidates);
    const result = expect(terminating).rejects.toBeInstanceOf(StaleCallCommandError);
    resolveAuthority(false);

    await result;
    expect(createCandidates).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(authorityFailureCases)(
    "$mode native authority failure at $phase is classified with stale=$stale and coalesced",
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
        return acknowledgement(2);
      });
      const reject = (): CallSignalCommand => ({
        ...end(),
        type: "reject",
        reason: "declined",
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

  it("suppresses accept when terminal intent wins before dispatch", async () => {
    const dispatch = vi.fn(async () => acknowledgement(2));
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
      onTerminationError: vi.fn(),
    });

    const accepting = queue.enqueue(accept);
    const terminating = queue.requestTermination(() => [end()]);
    await expect(accepting).rejects.toBeInstanceOf(CallCommandSupersededError);
    await expect(terminating).resolves.toMatchObject({ acceptedSequence: 2 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "end" }),
      expect.anything(),
    );
  });

  it("aborts a stalled native command before terminal compensation", async () => {
    const order: string[] = [];
    const dispatch = vi.fn((command: CallSignalCommand, signal: AbortSignal) => {
      order.push(command.type);
      if (command.type === "end") return Promise.resolve(acknowledgement(3));
      return new Promise<CallSignalAck>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
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
    await Promise.resolve();
    const stalledResult = expect(stalled).rejects.toBeInstanceOf(CallCommandSupersededError);
    const terminating = queue.requestTermination(() => [end()]);

    await stalledResult;
    await expect(terminating).resolves.toMatchObject({ acceptedSequence: 3 });
    expect(order).toEqual(["accept", "end"]);
  });

  it("stops a native ring after an invite commit loses its capability acknowledgement", async () => {
    let remoteRinging = false;
    const order: string[] = [];
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
      return Promise.resolve(acknowledgement(2));
    });
    const queue = createTestQueue({
      dispatch,
      isCurrent: () => true,
      isConflict: () => false,
      observeAck: vi.fn(),
      onTerminated: vi.fn(),
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
  });
});
