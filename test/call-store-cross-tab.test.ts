import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callTerminalFenceElapsedNowMs,
  isCallTerminalFenced,
  recordCallTerminalFence,
  restoreCallTerminalFences,
  rollbackSafeCallWallNowMs,
  serializeCallTerminalFences,
  createRollbackSafeCallClock,
} from "@peekpoke/shared";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const CALL_A = "44444444-4444-4444-8444-444444444444";
const CALL_B = "77777777-7777-4777-8777-777777777777";
const UNSEEN_CALL = "99999999-9999-4999-8999-999999999999";
const STORAGE_KEY = `peekpoke:call-terminal-fences:${ACCOUNT}`;
const EPOCH_KEY = `peekpoke:call-terminal-fence-epoch:${ACCOUNT}`;
const FALLBACK_KEY = `peekpoke:call-terminal-fence-fallback:${ACCOUNT}`;
const LEASE_KEY = `peekpoke:call-terminal-fence-lease:${ACCOUNT}`;
const SHARD_PREFIX = `peekpoke:call-terminal-fence-shard:${ACCOUNT}:`;

type Store = typeof import("@/stores/callStore")["useCallStore"];
type StorageListener = (event: { key: string | null; newValue: string | null }) => void;

class FakeWindow {
  readonly storageListeners = new Set<StorageListener>();

  addEventListener(type: string, listener: StorageListener) {
    if (type === "storage") this.storageListeners.add(listener);
  }

  emitStorage(key: string, newValue: string | null) {
    for (const listener of this.storageListeners) listener({ key, newValue });
  }
}

class SerialLockManager {
  reject = false;
  private queues = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    _options: LockOptions,
    callback: (lock: Lock) => T | PromiseLike<T>,
  ): Promise<T> {
    if (this.reject) return Promise.reject(new Error("lock unavailable"));
    const previous = this.queues.get(name) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => callback({ name, mode: "exclusive" } as Lock));
    this.queues.set(name, current);
    return current.finally(() => {
      if (this.queues.get(name) === current) this.queues.delete(name);
    });
  }
}

class FakeBroadcastChannel {
  static instances = new Set<FakeBroadcastChannel>();
  private listeners = new Set<(event: { data: unknown }) => void>();

  constructor(_name: string) {
    FakeBroadcastChannel.instances.add(this);
  }

  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    if (type === "message") this.listeners.add(listener);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.instances) {
      if (channel === this) continue;
      for (const listener of channel.listeners) listener({ data });
    }
  }

  close() {
    FakeBroadcastChannel.instances.delete(this);
  }
}

const persisted = new Map<string, string>();
const fakeWindow = new FakeWindow();
const locks = new SerialLockManager();
let rejectWrites: ((key: string) => boolean) | null = null;

async function createTab() {
  vi.resetModules();
  return (await import("@/stores/callStore")).useCallStore;
}

async function hydrate(tab: Store) {
  tab.getState().observeAccount(ACCOUNT);
  const generation = tab.getState().generation;
  await expect(tab.getState().hydrateTerminalCallFences(ACCOUNT, generation)).resolves.toBe(true);
  return generation;
}

function incomingInvite(generation: number) {
  return {
    accountId: ACCOUNT,
    generation,
    threadId: "33333333-3333-4333-8333-333333333333",
    callId: CALL_A,
    fromUser: {
      id: "22222222-2222-4222-8222-222222222222",
      display_name: "Peer",
      username: "peer",
      avatar_url: null,
    },
    capability: "55555555-5555-4555-8555-555555555555",
    lastSequence: 1,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
}

describe("web terminal-fence cross-tab persistence", () => {
  beforeEach(() => {
    persisted.clear();
    fakeWindow.storageListeners.clear();
    FakeBroadcastChannel.instances.clear();
    locks.reject = false;
    rejectWrites = null;
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("navigator", { locks });
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("localStorage", {
      get length() { return persisted.size; },
      getItem: (key: string) => persisted.get(key) ?? null,
      key: (index: number) => [...persisted.keys()][index] ?? null,
      setItem: (key: string, value: string) => {
        if (rejectWrites?.(key)) throw new Error("quota exceeded");
        persisted.set(key, value);
      },
      removeItem: (key: string) => persisted.delete(key),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("merges stale two-tab snapshots under one account epoch", async () => {
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);

    expect(tabA.getState().fenceTerminalCall(CALL_A, generationA)).toBe(true);
    expect(tabB.getState().fenceTerminalCall(CALL_B, generationB)).toBe(true);
    await Promise.all([
      tabA.getState().flushTerminalCallFencePersistence(),
      tabB.getState().flushTerminalCallFencePersistence(),
    ]);

    const epoch = persisted.get(EPOCH_KEY)!;
    const restored = restoreCallTerminalFences(
      persisted.get(STORAGE_KEY) ?? null,
      ACCOUNT,
      callTerminalFenceElapsedNowMs(),
      Date.now(),
      epoch,
    );
    expect(restored.valid).toBe(true);
    expect(isCallTerminalFenced(restored.fences, CALL_A)).toBe(true);
    expect(isCallTerminalFenced(restored.fences, CALL_B)).toBe(true);
  });

  it("merges a BroadcastChannel update into another tab before acceptance", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);

    expect(tabA.getState().fenceTerminalCall(CALL_A, generationA)).toBe(true);
    await tabA.getState().flushTerminalCallFencePersistence();

    expect(tabB.getState().isTerminalCallFenced(CALL_A, generationB)).toBe(true);
  });

  it("atomically dismisses a held invite before cross-tab acceptance", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);
    expect(tabB.getState().setIncomingInvite(incomingInvite(generationB))).toBe(true);

    expect(tabA.getState().fenceTerminalCall(CALL_A, generationA)).toBe(true);
    await tabA.getState().flushTerminalCallFencePersistence();

    expect(tabB.getState().incomingInvite).toBeNull();
    await expect(tabB.getState().acceptCall(CALL_A, generationB)).resolves.toBe(false);
    expect(tabB.getState().activeCall).toBeNull();
  });

  it("coalesces acceptance while a terminal shard arrives during synchronization", async () => {
    vi.stubGlobal("navigator", {});
    const tab = await createTab();
    const generation = await hydrate(tab);
    expect(tab.getState().setIncomingInvite(incomingInvite(generation))).toBe(true);

    const firstAcceptance = tab.getState().acceptCall(CALL_A, generation);
    const secondAcceptance = tab.getState().acceptCall(CALL_A, generation);
    await Promise.resolve();
    const epoch = persisted.get(EPOCH_KEY)!;
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const terminalFences = new Map<string, number>();
    recordCallTerminalFence(terminalFences, CALL_A, elapsedNowMs);
    const serialized = serializeCallTerminalFences(
      terminalFences,
      ACCOUNT,
      elapsedNowMs,
      Date.now(),
      epoch,
    )!;
    const shardKey = `${SHARD_PREFIX}terminal-during-accept`;
    persisted.set(shardKey, serialized);
    fakeWindow.emitStorage(shardKey, serialized);

    await expect(Promise.all([firstAcceptance, secondAcceptance]))
      .resolves.toEqual([false, false]);
    expect(tab.getState().incomingInvite).toBeNull();
    expect(tab.getState().activeCall).toBeNull();
  });

  it("preserves the strongest overflow fence when another tab writes", async () => {
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);

    for (let index = 0; index <= 64; index += 1) {
      expect(tabA.getState().fenceTerminalCall(`terminal-${index}`, generationA)).toBe(true);
    }
    await tabA.getState().flushTerminalCallFencePersistence();
    expect(tabB.getState().fenceTerminalCall(CALL_B, generationB)).toBe(true);
    await tabB.getState().flushTerminalCallFencePersistence();
    await tabB.getState().synchronizeTerminalCallFences(ACCOUNT, generationB);

    expect(tabB.getState().isTerminalCallFenced(UNSEEN_CALL, generationB)).toBe(true);
    const epoch = persisted.get(EPOCH_KEY)!;
    const restored = restoreCallTerminalFences(
      persisted.get(STORAGE_KEY) ?? null,
      ACCOUNT,
      callTerminalFenceElapsedNowMs(),
      Date.now(),
      epoch,
    );
    expect(isCallTerminalFenced(restored.fences, UNSEEN_CALL)).toBe(true);
  });

  it("prevents a stale writer from resurrecting fences after sign-out", async () => {
    const tabA = await createTab();
    await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);

    expect(tabB.getState().fenceTerminalCall(CALL_B, generationB)).toBe(true);
    tabA.getState().observeAccount(null);
    await tabB.getState().flushTerminalCallFencePersistence();

    expect(persisted.has(STORAGE_KEY)).toBe(false);
    expect(persisted.has(FALLBACK_KEY)).toBe(false);
    expect(tabB.getState().terminalFencesReady).toBe(false);

    const reloaded = await createTab();
    const reloadedGeneration = await hydrate(reloaded);
    expect(reloaded.getState().isTerminalCallFenced(CALL_B, reloadedGeneration)).toBe(false);
  });

  it("merges storage events monotonically when an older event arrives last", async () => {
    const tab = await createTab();
    const generation = await hydrate(tab);
    const epoch = persisted.get(EPOCH_KEY)!;
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const wallClock = createRollbackSafeCallClock();
    const oldFences = new Map<string, number>();
    recordCallTerminalFence(oldFences, CALL_A, elapsedNowMs);
    const newestFences = new Map(oldFences);
    recordCallTerminalFence(newestFences, CALL_B, elapsedNowMs);
    const oldSerialized = serializeCallTerminalFences(
      oldFences,
      ACCOUNT,
      elapsedNowMs,
      rollbackSafeCallWallNowMs(wallClock),
      epoch,
    )!;
    const newestSerialized = serializeCallTerminalFences(
      newestFences,
      ACCOUNT,
      elapsedNowMs,
      rollbackSafeCallWallNowMs(wallClock),
      epoch,
    )!;

    fakeWindow.emitStorage(STORAGE_KEY, newestSerialized);
    fakeWindow.emitStorage(STORAGE_KEY, oldSerialized);

    expect(tab.getState().isTerminalCallFenced(CALL_A, generation)).toBe(true);
    expect(tab.getState().isTerminalCallFenced(CALL_B, generation)).toBe(true);
  });

  it("persists an overflow barrier when Web Locks fail", async () => {
    const tab = await createTab();
    const generation = await hydrate(tab);
    locks.reject = true;

    expect(tab.getState().fenceTerminalCall(CALL_A, generation)).toBe(true);
    await tab.getState().flushTerminalCallFencePersistence();

    expect(persisted.has(FALLBACK_KEY)).toBe(true);
    expect(tab.getState().terminalFencesReady).toBe(true);
    expect(tab.getState().isTerminalCallFenced(UNSEEN_CALL, generation)).toBe(true);
  });

  it("disables invite acceptance when quota blocks both commit and fallback", async () => {
    const tab = await createTab();
    const generation = await hydrate(tab);
    rejectWrites = (key) => key === STORAGE_KEY || key === FALLBACK_KEY;

    expect(tab.getState().fenceTerminalCall(CALL_A, generation)).toBe(true);
    await tab.getState().flushTerminalCallFencePersistence();

    expect(tab.getState().terminalFencesReady).toBe(false);
    expect(tab.getState().setIncomingInvite({
      accountId: ACCOUNT,
      generation,
      threadId: "33333333-3333-4333-8333-333333333333",
      callId: UNSEEN_CALL,
      fromUser: {
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
      capability: "55555555-5555-4555-8555-555555555555",
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })).toBe(false);
  });

  it("rotates a corrupt epoch and restores a fail-closed barrier", async () => {
    persisted.set(EPOCH_KEY, "x".repeat(129));
    persisted.set(STORAGE_KEY, "not-json");
    const tab = await createTab();
    const generation = await hydrate(tab);

    expect(persisted.get(EPOCH_KEY)).not.toBe("x".repeat(129));
    expect(persisted.has(STORAGE_KEY)).toBe(false);
    expect(persisted.has(FALLBACK_KEY)).toBe(true);
    expect(tab.getState().isTerminalCallFenced(UNSEEN_CALL, generation)).toBe(true);
  });

  it("steals a crashed fallback owner despite backward and forward wall-clock jumps", async () => {
    vi.stubGlobal("navigator", {});
    const wallClock = vi.spyOn(Date, "now");
    wallClock.mockReturnValue(2_000_000);
    const tab = await createTab();
    const generation = await hydrate(tab);
    persisted.set(LEASE_KEY, JSON.stringify({
      version: 1,
      owner: "crashed-owner",
      expiresAt: 2_000_250,
    }));

    wallClock.mockReturnValue(1_000);
    await expect(tab.getState().synchronizeTerminalCallFences(ACCOUNT, generation))
      .resolves.toBe(true);
    expect(persisted.has(LEASE_KEY)).toBe(false);
    expect(persisted.has(FALLBACK_KEY)).toBe(false);

    wallClock.mockReturnValue(4_000_000);
    await expect(tab.getState().synchronizeTerminalCallFences(ACCOUNT, generation))
      .resolves.toBe(true);
  });

  it("hydrates fallback shards after a complete tab restart", async () => {
    vi.stubGlobal("navigator", {});
    const firstTab = await createTab();
    const firstGeneration = await hydrate(firstTab);
    expect(firstTab.getState().fenceTerminalCall(CALL_A, firstGeneration)).toBe(true);
    await firstTab.getState().flushTerminalCallFencePersistence();
    expect([...persisted.keys()].some((key) => key.startsWith(SHARD_PREFIX))).toBe(true);

    const restartedTab = await createTab();
    const restartedGeneration = await hydrate(restartedTab);
    expect(restartedTab.getState().isTerminalCallFenced(CALL_A, restartedGeneration)).toBe(true);
  });

  it("settles simultaneous stale-break attempts without retaining a crashed lease", async () => {
    vi.stubGlobal("navigator", {});
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    const tabB = await createTab();
    const generationB = await hydrate(tabB);
    persisted.set(LEASE_KEY, JSON.stringify({ version: 1, owner: "crashed-owner" }));

    const [synchronizedA, synchronizedB] = await Promise.all([
      tabA.getState().synchronizeTerminalCallFences(ACCOUNT, generationA),
      tabB.getState().synchronizeTerminalCallFences(ACCOUNT, generationB),
    ]);

    expect(synchronizedA).toBe(true);
    expect(synchronizedB).toBe(true);
    expect(persisted.has(LEASE_KEY)).toBe(false);
  });

  it("keeps the new merged shard authoritative when an old owner resumes", async () => {
    vi.stubGlobal("navigator", {});
    const tabA = await createTab();
    const generationA = await hydrate(tabA);
    expect(tabA.getState().fenceTerminalCall(CALL_A, generationA)).toBe(true);
    await tabA.getState().flushTerminalCallFencePersistence();
    const oldShardKey = [...persisted.keys()].find((key) => key.startsWith(SHARD_PREFIX))!;
    const oldShard = persisted.get(oldShardKey)!;

    const tabB = await createTab();
    const generationB = await hydrate(tabB);
    expect(tabB.getState().fenceTerminalCall(CALL_B, generationB)).toBe(true);
    await tabB.getState().flushTerminalCallFencePersistence();
    const newShardKey = [...persisted.keys()].find((key) => key.startsWith(SHARD_PREFIX))!;
    expect(newShardKey).not.toBe(oldShardKey);

    // The paused old owner resumes after the newer commit. Its owner-scoped
    // shard cannot overwrite the newer owner's merged shard (ABA-safe).
    persisted.set(oldShardKey, oldShard);
    await expect(tabB.getState().synchronizeTerminalCallFences(ACCOUNT, generationB))
      .resolves.toBe(true);
    expect(tabB.getState().isTerminalCallFenced(CALL_A, generationB)).toBe(true);
    expect(tabB.getState().isTerminalCallFenced(CALL_B, generationB)).toBe(true);
  });

  it("ignores an old owner shard that resumes after auth-epoch invalidation", async () => {
    vi.stubGlobal("navigator", {});
    const signedInTab = await createTab();
    await hydrate(signedInTab);
    const oldEpoch = persisted.get(EPOCH_KEY)!;
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const oldFences = new Map<string, number>();
    recordCallTerminalFence(oldFences, CALL_A, elapsedNowMs);
    const staleShard = serializeCallTerminalFences(
      oldFences,
      ACCOUNT,
      elapsedNowMs,
      Date.now(),
      oldEpoch,
    )!;

    signedInTab.getState().observeAccount(null);
    const resumedOldShardKey = `${SHARD_PREFIX}resumed-old-owner`;
    persisted.set(resumedOldShardKey, staleShard);

    const newSessionTab = await createTab();
    const newGeneration = await hydrate(newSessionTab);
    expect(persisted.has(resumedOldShardKey)).toBe(false);
    expect(newSessionTab.getState().isTerminalCallFenced(CALL_A, newGeneration)).toBe(false);
  });

  it("lets a one-time overflow barrier expire after fallback ownership recovers", async () => {
    vi.stubGlobal("navigator", {});
    let elapsedNowMs = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => elapsedNowMs);
    const tab = await createTab();
    const generation = await hydrate(tab);
    rejectWrites = (key) => key === LEASE_KEY;

    await expect(tab.getState().synchronizeTerminalCallFences(ACCOUNT, generation))
      .resolves.toBe(true);
    expect(persisted.has(FALLBACK_KEY)).toBe(true);
    expect(tab.getState().isTerminalCallFenced(UNSEEN_CALL, generation)).toBe(true);

    rejectWrites = null;
    elapsedNowMs += 60_001;
    await expect(tab.getState().synchronizeTerminalCallFences(ACCOUNT, generation))
      .resolves.toBe(true);
    expect(tab.getState().setIncomingInvite({
      accountId: ACCOUNT,
      generation,
      threadId: "33333333-3333-4333-8333-333333333333",
      callId: UNSEEN_CALL,
      fromUser: {
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Peer",
        username: "peer",
        avatar_url: null,
      },
      capability: "55555555-5555-4555-8555-555555555555",
      lastSequence: 1,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })).toBe(true);
  });
});
