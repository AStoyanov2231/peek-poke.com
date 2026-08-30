import { describe, expect, it, vi } from "vitest";
import {
  ApiTransportError,
  createMeetingAttemptCoordinator,
  createMeetingCompletionRegistry,
  meetingResponseCompletesPair,
  type MeetingResponse,
} from "@peekpoke/shared";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const FRIEND = "33333333-3333-4333-8333-333333333333";
const FRIEND_B = "44444444-4444-4444-8444-444444444444";
const FRIEND_C = "55555555-5555-4555-8555-555555555555";

describe("meeting completion registry", () => {
  it("isolates account A from B and preserves A when switching A to B to A", () => {
    const registry = createMeetingCompletionRegistry();
    const firstAEpoch = registry.activate(ACCOUNT_A).epoch;
    registry.mark(firstAEpoch, FRIEND);

    const bEpoch = registry.activate(ACCOUNT_B).epoch;
    expect(registry.has(bEpoch, FRIEND)).toBe(false);
    registry.mark(bEpoch, FRIEND);
    const currentAEpoch = registry.activate(ACCOUNT_A).epoch;
    expect(registry.isCurrent(firstAEpoch)).toBe(false);
    expect(registry.has(currentAEpoch, FRIEND)).toBe(true);
    const currentBEpoch = registry.activate(ACCOUNT_B).epoch;
    expect(registry.has(currentBEpoch, FRIEND)).toBe(true);

    registry.clear(ACCOUNT_B);
    expect(registry.has(registry.activate(ACCOUNT_B).epoch, FRIEND)).toBe(false);
    expect(registry.has(registry.activate(ACCOUNT_A).epoch, FRIEND)).toBe(true);
  });

  it("uses bounded LRU eviction without crossing owner-peer identities", () => {
    const registry = createMeetingCompletionRegistry(2);
    const epoch = registry.activate(ACCOUNT_A).epoch;
    registry.mark(epoch, FRIEND);
    registry.mark(epoch, FRIEND_B);
    expect(registry.has(epoch, FRIEND)).toBe(true);

    registry.mark(epoch, FRIEND_C);

    expect(registry.size()).toBe(2);
    expect(registry.has(epoch, FRIEND)).toBe(true);
    expect(registry.has(epoch, FRIEND_B)).toBe(false);
    expect(registry.has(epoch, FRIEND_C)).toBe(true);
  });

  it("allows one authoritative already_met probe after an app-process restart", () => {
    const beforeRestart = createMeetingCompletionRegistry();
    const beforeEpoch = beforeRestart.activate(ACCOUNT_A).epoch;
    beforeRestart.mark(beforeEpoch, FRIEND);
    const afterRestart = createMeetingCompletionRegistry();
    const afterEpoch = afterRestart.activate(ACCOUNT_A).epoch;
    const authoritativeProbe = {
      success: true,
      awarded: false,
      already_met: true,
      balance: null,
    } as const;

    expect(beforeRestart.has(beforeEpoch, FRIEND)).toBe(true);
    expect(afterRestart.has(afterEpoch, FRIEND)).toBe(false);
    expect(meetingResponseCompletesPair(authoritativeProbe)).toBe(true);
    afterRestart.mark(afterEpoch, FRIEND);
    expect(afterRestart.has(afterEpoch, FRIEND)).toBe(true);
  });

  it("rejects unbounded or invalid capacity", () => {
    expect(() => createMeetingCompletionRegistry(0)).toThrow(RangeError);
    expect(() => createMeetingCompletionRegistry(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("meeting attempt recovery", () => {
  it("reuses one stable key after a lost response and commits the replay once", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000001");
    const deliveredKeys: string[] = [];
    const commit = vi.fn();

    await expect(coordinator.run(ACCOUNT_A, FRIEND, async (attempt) => {
      deliveredKeys.push(attempt.key);
      throw new ApiTransportError("Network unavailable", 0, "NETWORK_UNAVAILABLE");
    }, commit)).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    expect(coordinator.peek(ACCOUNT_A, FRIEND)?.key).toBe("meeting-attempt-key-000001");

    const replay = await coordinator.run(ACCOUNT_A, FRIEND, async (attempt) => {
      deliveredKeys.push(attempt.key);
      return { success: true, awarded: true, already_met: false, balance: 4 } as const;
    }, commit);

    expect(replay.balance).toBe(4);
    expect(deliveredKeys).toEqual([
      "meeting-attempt-key-000001",
      "meeting-attempt-key-000001",
    ]);
    expect(commit).toHaveBeenCalledOnce();
    expect(coordinator.peek(ACCOUNT_A, FRIEND)).toBeNull();
  });

  it("coalesces duplicate taps into one delivery and one cache commit", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000002");
    const commit = vi.fn();
    let resolve!: (value: { success: true }) => void;
    const delivery = vi.fn(() => new Promise<{ success: true }>((done) => { resolve = done; }));

    const first = coordinator.run(ACCOUNT_A, FRIEND, delivery, commit);
    const duplicate = coordinator.run(ACCOUNT_A, FRIEND, delivery, commit);
    await Promise.resolve();
    expect(delivery).toHaveBeenCalledOnce();
    resolve({ success: true });

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { success: true },
      { success: true },
    ]);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("separates accounts and supports explicit discard after ambiguous failure", async () => {
    let sequence = 0;
    const coordinator = createMeetingAttemptCoordinator(() => `meeting-attempt-key-00000${++sequence}`);
    const fail = (attempt: { key: string }) => Promise.reject(
      new ApiTransportError(attempt.key, 0, "REQUEST_TIMEOUT"),
    );

    await expect(coordinator.run(ACCOUNT_A, FRIEND, fail)).rejects.toMatchObject({ status: 0 });
    await expect(coordinator.run(ACCOUNT_B, FRIEND, fail)).rejects.toMatchObject({ status: 0 });
    expect(coordinator.peek(ACCOUNT_A, FRIEND)?.key)
      .not.toBe(coordinator.peek(ACCOUNT_B, FRIEND)?.key);
    expect(coordinator.discard(ACCOUNT_A, FRIEND)).toBe(true);
    expect(coordinator.peek(ACCOUNT_A, FRIEND)).toBeNull();
    expect(coordinator.peek(ACCOUNT_B, FRIEND)).not.toBeNull();
  });

  it.each([
    ["background", "cta"],
    ["cta", "background"],
  ] as const)(
    "keeps the %s-owned network execution but commits to the current %s subscriber",
    async (firstConsumer, remainingConsumer) => {
      const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000003");
      const commits = {
        background: vi.fn(),
        cta: vi.fn(),
      };
      let resolve!: (value: { balance: number }) => void;
      const delivery = vi.fn(() => new Promise<{ balance: number }>((done) => { resolve = done; }));
      const ignoredDelivery = vi.fn(async () => ({ balance: 99 }));

      const first = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        delivery,
        commits[firstConsumer],
        firstConsumer,
      );
      const second = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        ignoredDelivery,
        commits[remainingConsumer],
        remainingConsumer,
      );
      coordinator.unsubscribe(ACCOUNT_A, FRIEND, firstConsumer);
      await Promise.resolve();
      resolve({ balance: 4 });

      await expect(Promise.all([first, second])).resolves.toEqual([
        { balance: 4 },
        { balance: 4 },
      ]);
      expect(delivery).toHaveBeenCalledOnce();
      expect(ignoredDelivery).not.toHaveBeenCalled();
      expect(commits[firstConsumer]).not.toHaveBeenCalled();
      expect(commits[remainingConsumer]).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["background", "cta"],
    ["cta", "background"],
  ] as const)(
    "keeps the %s subscriber when the later %s subscriber unmounts",
    async (remainingConsumer, removedConsumer) => {
      const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000006");
      const commits = {
        background: vi.fn(),
        cta: vi.fn(),
      };
      let resolve!: (value: { balance: number }) => void;
      const delivery = vi.fn(() => new Promise<{ balance: number }>((done) => { resolve = done; }));

      const first = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        delivery,
        commits[remainingConsumer],
        remainingConsumer,
      );
      const second = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        async () => ({ balance: 99 }),
        commits[removedConsumer],
        removedConsumer,
      );
      coordinator.unsubscribe(ACCOUNT_A, FRIEND, removedConsumer);
      await Promise.resolve();
      resolve({ balance: 4 });

      await expect(Promise.all([first, second])).resolves.toEqual([
        { balance: 4 },
        { balance: 4 },
      ]);
      expect(delivery).toHaveBeenCalledOnce();
      expect(commits[remainingConsumer]).toHaveBeenCalledOnce();
      expect(commits[removedConsumer]).not.toHaveBeenCalled();
    },
  );

  it("deduplicates one consumer listener while preserving distinct consumers", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000004");
    const firstVersion = vi.fn();
    const currentVersion = vi.fn();
    const cta = vi.fn();
    let resolve!: (value: { balance: number }) => void;
    const delivery = () => new Promise<{ balance: number }>((done) => { resolve = done; });

    const first = coordinator.run(ACCOUNT_A, FRIEND, delivery, firstVersion, "background");
    const duplicate = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      async () => ({ balance: 99 }),
      currentVersion,
      "background",
    );
    const foreground = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      async () => ({ balance: 99 }),
      cta,
      "cta:thread-a",
    );
    await Promise.resolve();
    resolve({ balance: 5 });
    await Promise.all([first, duplicate, foreground]);

    expect(firstVersion).not.toHaveBeenCalled();
    expect(currentVersion).toHaveBeenCalledOnce();
    expect(cta).toHaveBeenCalledOnce();
  });

  it("retains current subscribers across lost-response retry and fences a switched thread", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000005");
    const background = vi.fn();
    const staleThread = vi.fn();
    const currentThread = vi.fn();
    const seenKeys: string[] = [];

    await expect(coordinator.run(ACCOUNT_A, FRIEND, async (attempt) => {
      seenKeys.push(attempt.key);
      throw new ApiTransportError("Network unavailable", 0, "NETWORK_UNAVAILABLE");
    }, background, "background")).rejects.toMatchObject({ status: 0 });

    let resolve!: (value: { balance: number }) => void;
    const retry = coordinator.run(ACCOUNT_A, FRIEND, async (attempt) => {
      seenKeys.push(attempt.key);
      return new Promise<{ balance: number }>((done) => { resolve = done; });
    }, background, "background");
    const oldThread = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      async () => ({ balance: 99 }),
      staleThread,
      "cta:old-thread",
    );
    const newThread = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      async () => ({ balance: 99 }),
      currentThread,
      "cta:new-thread",
    );
    coordinator.unsubscribe(ACCOUNT_A, FRIEND, "cta:old-thread");
    await Promise.resolve();
    resolve({ balance: 4 });

    await expect(Promise.all([retry, oldThread, newThread])).resolves.toEqual([
      { balance: 4 },
      { balance: 4 },
      { balance: 4 },
    ]);

    expect(seenKeys).toEqual([
      "meeting-attempt-key-000005",
      "meeting-attempt-key-000005",
    ]);
    expect(background).toHaveBeenCalledOnce();
    expect(staleThread).not.toHaveBeenCalled();
    expect(currentThread).toHaveBeenCalledOnce();
  });

  it.each([
    ["account", ACCOUNT_B, FRIEND],
    ["peer", ACCOUNT_A, FRIEND_B],
  ] as const)(
    "fences only the stale CTA on %s switch without suppressing either current identity",
    async (_switch, nextAccount, nextFriend) => {
      let sequence = 0;
      const coordinator = createMeetingAttemptCoordinator(
        () => `meeting-identity-switch-00000${++sequence}`,
      );
      const oldBackground = vi.fn();
      const oldCta = vi.fn();
      const currentCta = vi.fn();
      let resolveOld!: (value: { balance: number }) => void;
      let resolveCurrent!: (value: { balance: number }) => void;

      const oldAttempt = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        () => new Promise<{ balance: number }>((done) => { resolveOld = done; }),
        oldBackground,
        "background",
      );
      const staleCtaAttempt = coordinator.run(
        ACCOUNT_A,
        FRIEND,
        async () => ({ balance: 99 }),
        oldCta,
        "cta:old-owner",
      );
      coordinator.unsubscribe(ACCOUNT_A, FRIEND, "cta:old-owner");
      const currentAttempt = coordinator.run(
        nextAccount,
        nextFriend,
        () => new Promise<{ balance: number }>((done) => { resolveCurrent = done; }),
        currentCta,
        "cta:current-owner",
      );
      await Promise.resolve();
      resolveOld({ balance: 4 });
      resolveCurrent({ balance: 9 });

      await Promise.all([oldAttempt, staleCtaAttempt, currentAttempt]);
      expect(oldBackground).toHaveBeenCalledOnce();
      expect(oldCta).not.toHaveBeenCalled();
      expect(currentCta).toHaveBeenCalledOnce();
    },
  );

  it("does not let one failing cache listener suppress another consumer", async () => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-attempt-key-000007");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const current = vi.fn();
    let resolve!: (value: { balance: number }) => void;

    const first = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      () => new Promise<{ balance: number }>((done) => { resolve = done; }),
      () => { throw new Error("unmounted cache"); },
      "background",
    );
    const second = coordinator.run(
      ACCOUNT_A,
      FRIEND,
      async () => ({ balance: 99 }),
      current,
      "cta",
    );
    await Promise.resolve();
    resolve({ balance: 4 });

    await Promise.all([first, second]);
    expect(current).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it.each([
    ["background", "cta"],
    ["cta", "background"],
  ] as const)(
    "treats a capped-wallet response as completed with %s/%s overlap and skips the next cycle",
    async (...order) => {
      const coordinator = createMeetingAttemptCoordinator(() => "meeting-capped-wallet-0001");
      const completed = new Set<string>();
      const deliveredKeys: string[] = [];
      const balance = { current: 0 };
      const deliver = vi.fn(async (attempt: { key: string }) => {
        deliveredKeys.push(attempt.key);
        return {
          success: true,
          awarded: false,
          already_met: false,
          balance: 5,
        } as const;
      });
      const runBackgroundCycle = () => {
        if (completed.has(FRIEND)) return Promise.resolve(null);
        return coordinator.run(ACCOUNT_A, FRIEND, deliver, (result) => {
          balance.current = result.balance;
        }, "background").then((result) => {
          if (meetingResponseCompletesPair(result)) completed.add(FRIEND);
          return result;
        });
      };
      const runCta = () => coordinator.run(ACCOUNT_A, FRIEND, deliver, (result) => {
        balance.current = result.balance;
      }, "cta");

      await Promise.all(order.map((consumer) => (
        consumer === "background" ? runBackgroundCycle() : runCta()
      )));
      await runBackgroundCycle();

      expect(completed).toContain(FRIEND);
      expect(deliver).toHaveBeenCalledOnce();
      expect(deliveredKeys).toEqual(["meeting-capped-wallet-0001"]);
      expect(balance.current).toBe(5);
    },
  );

  it.each([
    ["transport", new ApiTransportError("Network unavailable", 0, "NETWORK_UNAVAILABLE")],
    ["server", new ApiTransportError("Meeting rejected", 409, "LOCATION_STALE")],
  ])("does not complete the pair for a %s error", async (_kind, failure) => {
    const coordinator = createMeetingAttemptCoordinator(() => "meeting-error-outcome-00001");
    const completed = new Set<string>();

    await expect(coordinator.run(ACCOUNT_A, FRIEND, async (): Promise<MeetingResponse> => {
      throw failure;
    }).then((result) => {
      if (meetingResponseCompletesPair(result)) completed.add(FRIEND);
    })).rejects.toBe(failure);

    expect(completed).not.toContain(FRIEND);
  });
});
