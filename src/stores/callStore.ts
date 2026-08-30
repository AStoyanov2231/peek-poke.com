"use client";

import { create } from "zustand";
import {
  callTerminalFenceElapsedNowMs,
  createRollbackSafeCallClock,
  failClosedCallTerminalFences,
  isCallTerminalFenced,
  raiseRollbackSafeCallClockFloor,
  recordCallTerminalFence,
  restoreCallTerminalFences,
  rollbackSafeCallWallNowMs,
  serializeCallTerminalFences,
  type CallDirection,
  type CallPeerInfo,
  type CallStatus,
} from "@peekpoke/shared";

const TERMINAL_FENCE_STORAGE_PREFIX = "peekpoke:call-terminal-fences:";
const TERMINAL_FENCE_EPOCH_PREFIX = "peekpoke:call-terminal-fence-epoch:";
const TERMINAL_FENCE_FALLBACK_PREFIX = "peekpoke:call-terminal-fence-fallback:";
const TERMINAL_FENCE_SHARD_PREFIX = "peekpoke:call-terminal-fence-shard:";
const TERMINAL_FENCE_LEASE_PREFIX = "peekpoke:call-terminal-fence-lease:";
const TERMINAL_FENCE_CHANNEL = "peekpoke:call-terminal-fences";
const TERMINAL_FENCE_LOCK_WAIT_MS = 50;
const TERMINAL_FENCE_LEASE_ATTEMPTS = 4;
const MAX_TERMINAL_FENCE_SHARDS = 128;
let callClock = createRollbackSafeCallClock();
let epochSequence = 0;
let terminalFenceListenersReady = false;
let terminalFenceChannel: BroadcastChannel | null = null;
const terminalFencePersistenceQueues = new Map<string, Promise<void>>();
let acceptCallInFlight: { key: string; promise: Promise<boolean> } | null = null;

function terminalFenceStorageKey(accountId: string) {
  return `${TERMINAL_FENCE_STORAGE_PREFIX}${accountId}`;
}

function terminalFenceEpochKey(accountId: string) {
  return `${TERMINAL_FENCE_EPOCH_PREFIX}${accountId}`;
}

function terminalFenceFallbackKey(accountId: string) {
  return `${TERMINAL_FENCE_FALLBACK_PREFIX}${accountId}`;
}

function terminalFenceShardPrefix(accountId: string) {
  return `${TERMINAL_FENCE_SHARD_PREFIX}${accountId}:`;
}

function terminalFenceShardKey(accountId: string, owner: string) {
  return `${terminalFenceShardPrefix(accountId)}${owner}`;
}

function terminalFenceLeaseKey(accountId: string) {
  return `${TERMINAL_FENCE_LEASE_PREFIX}${accountId}`;
}

function listTerminalFenceShardKeys(accountId: string) {
  if (typeof localStorage === "undefined") return [];
  const prefix = terminalFenceShardPrefix(accountId);
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function newTerminalFenceEpoch() {
  epochSequence += 1;
  let randomId = globalThis.crypto?.randomUUID?.();
  if (!randomId && globalThis.crypto?.getRandomValues) {
    const randomWords = new Uint32Array(4);
    globalThis.crypto.getRandomValues(randomWords);
    randomId = [...randomWords].map((word) => word.toString(36)).join("-");
  }
  randomId ??= `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${Date.now().toString(36)}-${epochSequence.toString(36)}-${randomId}`;
}

function isValidTerminalFenceEpoch(epoch: string | null): epoch is string {
  return epoch !== null && epoch.length > 0 && epoch.length <= 128;
}

function persistedTerminalFenceEpoch(serialized: string) {
  try {
    const parsed = JSON.parse(serialized) as { sessionEpoch?: unknown };
    return typeof parsed.sessionEpoch === "string" ? parsed.sessionEpoch : null;
  } catch {
    return null;
  }
}

function mergeTerminalFenceMaps(target: Map<string, number>, source: Map<string, number>) {
  for (const [callId, deadline] of source) {
    target.set(callId, Math.max(target.get(callId) ?? 0, deadline));
  }
}

function enqueueTerminalFencePersistence(accountId: string, task: () => Promise<void>) {
  const previous = terminalFencePersistenceQueues.get(accountId) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(task);
  terminalFencePersistenceQueues.set(accountId, queued);
  void queued.finally(() => {
    if (terminalFencePersistenceQueues.get(accountId) === queued) {
      terminalFencePersistenceQueues.delete(accountId);
    }
  }).catch(() => undefined);
  return queued;
}

function postTerminalFenceMessage(message: Record<string, unknown>) {
  try {
    terminalFenceChannel?.postMessage(message);
  } catch {
    // Storage events remain the primary cross-tab delivery path.
  }
}

function removePersistedTerminalFencePayloads(accountId: string) {
  localStorage.removeItem(terminalFenceStorageKey(accountId));
  localStorage.removeItem(terminalFenceFallbackKey(accountId));
  for (const key of listTerminalFenceShardKeys(accountId)) localStorage.removeItem(key);
  localStorage.removeItem(terminalFenceLeaseKey(accountId));
}

function invalidatePersistedTerminalFences(accountId: string) {
  const epoch = newTerminalFenceEpoch();
  try {
    if (typeof localStorage === "undefined") throw new Error("storage unavailable");
    localStorage.setItem(terminalFenceEpochKey(accountId), epoch);
    removePersistedTerminalFencePayloads(accountId);
  } catch {
    // The signed-out tab has no call listener. Other tabs also validate their
    // authenticated session and durable epoch before accepting an invite.
  }
  postTerminalFenceMessage({ type: "invalidate", accountId, epoch });
}

type ExclusiveResult<T> = { acquired: true; value: T } | { acquired: false };
type TerminalFenceLockContext =
  | { mode: "web-lock" }
  | { mode: "lease"; owner: string };

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withTerminalFenceLease<T>(
  accountId: string,
  task: (context: TerminalFenceLockContext) => T,
): Promise<ExclusiveResult<T>> {
  if (typeof localStorage === "undefined") return { acquired: false };
  const leaseKey = terminalFenceLeaseKey(accountId);
  for (let attempt = 0; attempt < TERMINAL_FENCE_LEASE_ATTEMPTS; attempt += 1) {
    const owner = newTerminalFenceEpoch();
    const lease = JSON.stringify({ version: 1, owner });
    try {
      // Ownership is deliberately stealable after a short monotonic settling
      // window. A crashed owner cannot strand the account after a wall rollback.
      localStorage.setItem(leaseKey, lease);
      const settleMs = 2 + (owner.charCodeAt(owner.length - 1) % 5) + (attempt * 2);
      await sleep(settleMs);
      if (localStorage.getItem(leaseKey) === lease) {
        const value = task({ mode: "lease", owner });
        if (localStorage.getItem(leaseKey) === lease) localStorage.removeItem(leaseKey);
        return { acquired: true, value };
      }
    } catch {
      return { acquired: false };
    }
    await sleep(attempt + 1);
  }
  return { acquired: false };
}

async function withTerminalFenceLock<T>(
  accountId: string,
  task: (context: TerminalFenceLockContext) => T,
): Promise<ExclusiveResult<T>> {
  const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!lockManager) return withTerminalFenceLease(accountId, task);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TERMINAL_FENCE_LOCK_WAIT_MS);
  try {
    const value = await lockManager.request(
      `peekpoke-call-terminal-fences:${accountId}`,
      { mode: "exclusive", signal: controller.signal },
      () => task({ mode: "web-lock" }),
    );
    return { acquired: true, value };
  } catch {
    return { acquired: false };
  } finally {
    clearTimeout(timeout);
  }
}

export type ActiveCall = {
  accountId: string;
  generation: number;
  threadId: string;
  callId: string;
  peer: CallPeerInfo;
  direction: CallDirection;
  status: CallStatus;
  capability: string | null;
  lastSequence: number;
};

export type IncomingInvite = {
  accountId: string;
  generation: number;
  threadId: string;
  callId: string;
  fromUser: CallPeerInfo;
  capability: string;
  lastSequence: number;
  expiresAt: string;
};

interface CallStore {
  accountId: string | null;
  generation: number;
  terminalFenceEpoch: string | null;
  activeCall: ActiveCall | null;
  incomingInvite: IncomingInvite | null;
  terminalCallFences: Map<string, number>;
  terminalFencesReady: boolean;
  observeAccount: (accountId: string | null) => void;
  startOutgoingCall: (
    accountId: string,
    threadId: string,
    callId: string,
    peer: CallPeerInfo,
  ) => boolean;
  setIncomingInvite: (invite: IncomingInvite) => boolean;
  acceptCall: (callId: string, generation: number) => Promise<boolean>;
  declineCall: () => void;
  setCallSession: (
    callId: string,
    generation: number,
    capability: string,
    lastSequence: number,
  ) => boolean;
  advanceCallSequence: (callId: string, generation: number, sequence: number) => boolean;
  setCallStatus: (callId: string, generation: number, status: CallStatus) => boolean;
  fenceTerminalCall: (callId: string, generation: number) => boolean;
  isTerminalCallFenced: (callId: string, generation: number, elapsedNowMs?: number) => boolean;
  hydrateTerminalCallFences: (accountId: string, generation: number) => Promise<boolean>;
  synchronizeTerminalCallFences: (accountId: string, generation: number) => Promise<boolean>;
  flushTerminalCallFencePersistence: () => Promise<void>;
  callSignalNowMs: () => number;
  clearCall: (callId?: string, generation?: number) => boolean;
  clearInvite: (callId?: string, generation?: number) => boolean;
  reset: () => void;
}

type PersistedFenceRead =
  | {
    status: "ok";
    fences: Map<string, number>;
    wallClockFloorMs: number;
    shardKeys: string[];
  }
  | { status: "corrupt" | "stale" | "unavailable" };

function callsAfterTerminalFenceMerge(
  state: Pick<CallStore, "activeCall" | "incomingInvite">,
  terminalCallFences: Map<string, number>,
) {
  const elapsedNowMs = callTerminalFenceElapsedNowMs();
  const incomingInvite = state.incomingInvite
    && isCallTerminalFenced(terminalCallFences, state.incomingInvite.callId, elapsedNowMs)
    ? null
    : state.incomingInvite;
  const activeCall = state.activeCall
    && isCallTerminalFenced(terminalCallFences, state.activeCall.callId, elapsedNowMs)
    ? null
    : state.activeCall;
  return { activeCall, incomingInvite };
}

function readPersistedTerminalFences(accountId: string, epoch: string): PersistedFenceRead {
  if (typeof localStorage === "undefined") return { status: "unavailable" };
  if (!isValidTerminalFenceEpoch(epoch)) return { status: "corrupt" };
  try {
    if (localStorage.getItem(terminalFenceEpochKey(accountId)) !== epoch) {
      return { status: "stale" };
    }
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const wallNowMs = rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs);
    const restoreStored = (key: string) => {
      const serialized = localStorage.getItem(key);
      const scoped = restoreCallTerminalFences(
        serialized,
        accountId,
        elapsedNowMs,
        wallNowMs,
        epoch,
      );
      if (scoped.valid) return scoped;
      if (serialized) {
        const unscoped = restoreCallTerminalFences(
          serialized,
          accountId,
          elapsedNowMs,
          wallNowMs,
        );
        const storedEpoch = persistedTerminalFenceEpoch(serialized);
        if (unscoped.valid && storedEpoch && storedEpoch !== epoch) {
          // A paused writer from an invalidated auth epoch may finish after
          // sign-out. It is well-formed but cannot fence the new session.
          localStorage.removeItem(key);
          return restoreCallTerminalFences(null, accountId, elapsedNowMs, wallNowMs, epoch);
        }
      }
      return null;
    };
    const persisted = restoreStored(terminalFenceStorageKey(accountId));
    const fallback = restoreStored(terminalFenceFallbackKey(accountId));
    if (!persisted || !fallback) return { status: "corrupt" };
    const shardKeys = listTerminalFenceShardKeys(accountId);
    if (shardKeys.length > MAX_TERMINAL_FENCE_SHARDS) return { status: "corrupt" };
    const fences = new Map(persisted.fences);
    mergeTerminalFenceMaps(fences, fallback.fences);
    let wallClockFloorMs = Math.max(
      persisted.wallClockFloorMs,
      fallback.wallClockFloorMs,
    );
    for (const key of shardKeys) {
      const shard = restoreStored(key);
      if (!shard) return { status: "corrupt" };
      mergeTerminalFenceMaps(fences, shard.fences);
      wallClockFloorMs = Math.max(wallClockFloorMs, shard.wallClockFloorMs);
    }
    return {
      status: "ok",
      fences,
      wallClockFloorMs,
      shardKeys,
    };
  } catch {
    return { status: "unavailable" };
  }
}

function setTerminalFenceStoreUnavailable(accountId: string, generation: number, epoch: string | null) {
  const state = useCallStore.getState();
  if (
    state.accountId === accountId
    && state.generation === generation
    && (epoch === null || state.terminalFenceEpoch === epoch)
  ) {
    useCallStore.setState({ incomingInvite: null, terminalFencesReady: false });
  }
}

function mergePersistedFencesIntoStore(
  accountId: string,
  generation: number,
  epoch: string,
  persisted: Extract<PersistedFenceRead, { status: "ok" }>,
) {
  const state = useCallStore.getState();
  if (
    state.accountId !== accountId
    || state.generation !== generation
    || state.terminalFenceEpoch !== epoch
  ) return false;
  raiseRollbackSafeCallClockFloor(callClock, persisted.wallClockFloorMs);
  const terminalCallFences = new Map(state.terminalCallFences);
  mergeTerminalFenceMaps(terminalCallFences, persisted.fences);
  useCallStore.setState({
    ...callsAfterTerminalFenceMerge(state, terminalCallFences),
    terminalCallFences,
    terminalFencesReady: true,
  });
  return true;
}

function activatePersistentFailClosedFence(
  accountId: string,
  generation: number,
  epoch: string,
) {
  const state = useCallStore.getState();
  if (
    state.accountId !== accountId
    || state.generation !== generation
    || (state.terminalFenceEpoch !== null && state.terminalFenceEpoch !== epoch)
  ) return false;
  const elapsedNowMs = callTerminalFenceElapsedNowMs();
  const terminalCallFences = new Map(state.terminalCallFences);
  failClosedCallTerminalFences(terminalCallFences, elapsedNowMs);
  try {
    if (typeof localStorage === "undefined") throw new Error("storage unavailable");
    if (localStorage.getItem(terminalFenceEpochKey(accountId)) !== epoch) {
      setTerminalFenceStoreUnavailable(accountId, generation, state.terminalFenceEpoch);
      return false;
    }
    const serialized = serializeCallTerminalFences(
      terminalCallFences,
      accountId,
      elapsedNowMs,
      rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
      epoch,
    );
    if (!serialized) throw new Error("missing fail-closed fence");
    localStorage.setItem(terminalFenceFallbackKey(accountId), serialized);
    useCallStore.setState({
      ...callsAfterTerminalFenceMerge(state, terminalCallFences),
      terminalFenceEpoch: epoch,
      terminalCallFences,
      terminalFencesReady: true,
    });
    postTerminalFenceMessage({ type: "update", accountId, epoch, serialized });
    return true;
  } catch {
    useCallStore.setState({
      ...callsAfterTerminalFenceMerge(state, terminalCallFences),
      terminalCallFences,
      terminalFencesReady: false,
    });
    return false;
  }
}

function persistTerminalCallFences(
  accountId: string,
  generation: number,
  epoch: string | null,
  fences: Map<string, number>,
) {
  if (!epoch) {
    setTerminalFenceStoreUnavailable(accountId, generation, epoch);
    return;
  }
  const snapshot = new Map(fences);
  void enqueueTerminalFencePersistence(accountId, async () => {
    const exclusive = await withTerminalFenceLock(accountId, (lock) => {
      const state = useCallStore.getState();
      if (
        state.accountId !== accountId
        || state.generation !== generation
        || state.terminalFenceEpoch !== epoch
      ) return { status: "stale" as const };
      const persisted = readPersistedTerminalFences(accountId, epoch);
      if (persisted.status !== "ok") return persisted;
      raiseRollbackSafeCallClockFloor(
        callClock,
        persisted.wallClockFloorMs,
        callTerminalFenceElapsedNowMs(),
      );
      const terminalCallFences = new Map(persisted.fences);
      mergeTerminalFenceMaps(terminalCallFences, snapshot);
      try {
        if (localStorage.getItem(terminalFenceEpochKey(accountId)) !== epoch) {
          return { status: "stale" as const };
        }
        const elapsedNowMs = callTerminalFenceElapsedNowMs();
        const serialized = serializeCallTerminalFences(
          terminalCallFences,
          accountId,
          elapsedNowMs,
          rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
          epoch,
        );
        // Fallback owners commit to an owner-scoped shard. A paused old owner
        // can resume without overwriting a newer owner's merged snapshot.
        if (serialized) {
          if (lock.mode === "web-lock") {
            localStorage.setItem(terminalFenceStorageKey(accountId), serialized);
          } else {
            localStorage.setItem(
              terminalFenceShardKey(accountId, lock.owner),
              serialized,
            );
          }
          for (const key of persisted.shardKeys) {
            if (lock.mode === "lease" && key === terminalFenceShardKey(accountId, lock.owner)) {
              continue;
            }
            localStorage.removeItem(key);
          }
        }
        return { status: "written" as const, terminalCallFences, serialized };
      } catch {
        return { status: "unavailable" as const };
      }
    });
    if (!exclusive.acquired) {
      activatePersistentFailClosedFence(accountId, generation, epoch);
      return;
    }
    const result = exclusive.value;
    if (result.status === "written") {
      mergePersistedFencesIntoStore(accountId, generation, epoch, {
        status: "ok",
        fences: result.terminalCallFences,
        wallClockFloorMs: rollbackSafeCallWallNowMs(callClock),
        shardKeys: [],
      });
      postTerminalFenceMessage({
        type: "update",
        accountId,
        epoch,
        serialized: result.serialized,
      });
      return;
    }
    if (result.status === "stale") {
      setTerminalFenceStoreUnavailable(accountId, generation, epoch);
      return;
    }
    activatePersistentFailClosedFence(accountId, generation, epoch);
  });
}

function mergeExternalTerminalFenceUpdate(
  accountId: string,
  epoch: string,
  serialized: string | null,
) {
  const state = useCallStore.getState();
  if (
    state.accountId !== accountId
    || state.terminalFenceEpoch !== epoch
    || !serialized
  ) return;
  try {
    if (
      typeof localStorage === "undefined"
      || localStorage.getItem(terminalFenceEpochKey(accountId)) !== epoch
    ) {
      setTerminalFenceStoreUnavailable(accountId, state.generation, epoch);
      return;
    }
  } catch {
    setTerminalFenceStoreUnavailable(accountId, state.generation, epoch);
    return;
  }
  const elapsedNowMs = callTerminalFenceElapsedNowMs();
  const restored = restoreCallTerminalFences(
    serialized,
    accountId,
    elapsedNowMs,
    rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
    epoch,
  );
  if (!restored.valid) {
    setTerminalFenceStoreUnavailable(accountId, state.generation, epoch);
    return;
  }
  mergePersistedFencesIntoStore(accountId, state.generation, epoch, {
    status: "ok",
    fences: restored.fences,
    wallClockFloorMs: restored.wallClockFloorMs,
    shardKeys: [],
  });
}

function ensureTerminalFenceSyncListeners() {
  if (terminalFenceListenersReady || typeof window === "undefined") return;
  terminalFenceListenersReady = true;
  window.addEventListener("storage", (event) => {
    const state = useCallStore.getState();
    if (!state.accountId || !state.terminalFenceEpoch || !event.key) return;
    if (event.key === terminalFenceEpochKey(state.accountId)) {
      if (event.newValue !== state.terminalFenceEpoch) {
        useCallStore.setState({
          activeCall: null,
          incomingInvite: null,
          terminalCallFences: new Map(),
          terminalFencesReady: false,
        });
      }
      return;
    }
    if (
      event.key === terminalFenceStorageKey(state.accountId)
      || event.key === terminalFenceFallbackKey(state.accountId)
      || event.key.startsWith(terminalFenceShardPrefix(state.accountId))
    ) {
      mergeExternalTerminalFenceUpdate(
        state.accountId,
        state.terminalFenceEpoch,
        event.newValue,
      );
    }
  });
  if (typeof BroadcastChannel === "undefined") return;
  try {
    terminalFenceChannel = new BroadcastChannel(TERMINAL_FENCE_CHANNEL);
    terminalFenceChannel.addEventListener("message", (event) => {
      const message = event.data as {
        type?: unknown;
        accountId?: unknown;
        epoch?: unknown;
        serialized?: unknown;
      };
      const state = useCallStore.getState();
      if (
        typeof message.accountId !== "string"
        || typeof message.epoch !== "string"
        || state.accountId !== message.accountId
        || !state.terminalFenceEpoch
      ) return;
      if (message.type === "invalidate") {
        if (message.epoch !== state.terminalFenceEpoch) {
          useCallStore.setState({
            activeCall: null,
            incomingInvite: null,
            terminalCallFences: new Map(),
            terminalFencesReady: false,
          });
        }
        return;
      }
      if (message.type === "update" && typeof message.serialized === "string") {
        mergeExternalTerminalFenceUpdate(
          message.accountId,
          message.epoch,
          message.serialized,
        );
      }
    });
  } catch {
    terminalFenceChannel = null;
  }
}

export const useCallStore = create<CallStore>((set, get) => ({
  accountId: null,
  generation: 0,
  terminalFenceEpoch: null,
  activeCall: null,
  incomingInvite: null,
  terminalCallFences: new Map(),
  terminalFencesReady: true,

  observeAccount: (accountId) => {
    const previousAccountId = get().accountId;
    if (previousAccountId === accountId) return;
    ensureTerminalFenceSyncListeners();
    if (previousAccountId) invalidatePersistedTerminalFences(previousAccountId);
    callClock = createRollbackSafeCallClock();
    set((state) => ({
      accountId,
      generation: state.generation + 1,
      terminalFenceEpoch: null,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: accountId === null,
    }));
  },

  startOutgoingCall: (accountId, threadId, callId, peer) => {
    const state = get();
    if (state.accountId !== accountId || !state.terminalFencesReady || state.activeCall) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    if (isCallTerminalFenced(terminalCallFences, callId)) return false;
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(
        accountId,
        state.generation,
        state.terminalFenceEpoch,
        terminalCallFences,
      );
    }
    set({
      activeCall: {
        accountId,
        generation: state.generation,
        threadId,
        callId,
        peer,
        direction: "outgoing",
        status: "calling",
        capability: null,
        lastSequence: 0,
      },
      incomingInvite: null,
    });
    return true;
  },

  setIncomingInvite: (invite) => {
    const state = get();
    if (
      state.accountId !== invite.accountId
      || state.generation !== invite.generation
      || !state.terminalFencesReady
    ) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    if (isCallTerminalFenced(terminalCallFences, invite.callId)) return false;
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(
        invite.accountId,
        state.generation,
        state.terminalFenceEpoch,
        terminalCallFences,
      );
    }
    set({ incomingInvite: invite });
    return true;
  },

  acceptCall: async (callId, generation) => {
    const state = get();
    const invite = state.incomingInvite;
    if (
      !invite
      || invite.callId !== callId
      || invite.generation !== generation
      || !state.terminalFencesReady
      || state.accountId !== invite.accountId
      || state.generation !== invite.generation
    ) {
      return false;
    }
    const key = `${invite.accountId}:${generation}:${callId}`;
    if (acceptCallInFlight?.key === key) return acceptCallInFlight.promise;
    const promise = (async () => {
      const synchronized = await get().synchronizeTerminalCallFences(
        invite.accountId,
        generation,
      );
      if (!synchronized) return false;
      const current = get();
      const currentInvite = current.incomingInvite;
      if (
        !currentInvite
        || currentInvite.callId !== callId
        || currentInvite.generation !== generation
        || currentInvite.accountId !== invite.accountId
        || current.accountId !== invite.accountId
        || current.generation !== generation
        || !current.terminalFencesReady
      ) return false;
      const terminalCallFences = new Map(current.terminalCallFences);
      if (isCallTerminalFenced(terminalCallFences, callId)) {
        set({ incomingInvite: null, terminalCallFences });
        return false;
      }
      set({
        activeCall: {
          accountId: currentInvite.accountId,
          generation: currentInvite.generation,
          threadId: currentInvite.threadId,
          callId: currentInvite.callId,
          peer: currentInvite.fromUser,
          direction: "incoming",
          status: "connecting",
          capability: currentInvite.capability,
          lastSequence: currentInvite.lastSequence,
        },
        incomingInvite: null,
      });
      return true;
    })();
    acceptCallInFlight = { key, promise };
    try {
      return await promise;
    } finally {
      if (acceptCallInFlight?.promise === promise) acceptCallInFlight = null;
    }
  },

  declineCall: () => {
    const state = get();
    const current = state.incomingInvite;
    if (!current) return;
    const terminalCallFences = new Map(state.terminalCallFences);
    recordCallTerminalFence(terminalCallFences, current.callId);
    set({ incomingInvite: null, terminalCallFences });
    persistTerminalCallFences(
      current.accountId,
      current.generation,
      state.terminalFenceEpoch,
      terminalCallFences,
    );
  },

  setCallSession: (callId, generation, capability, lastSequence) => {
    const current = get().activeCall;
    if (!current || current.callId !== callId || current.generation !== generation) return false;
    set({ activeCall: { ...current, capability, lastSequence: Math.max(current.lastSequence, lastSequence) } });
    return true;
  },

  advanceCallSequence: (callId, generation, sequence) => {
    const current = get().activeCall;
    if (!current || current.callId !== callId || current.generation !== generation) return false;
    if (sequence <= current.lastSequence) return false;
    set({ activeCall: { ...current, lastSequence: sequence } });
    return true;
  },

  setCallStatus: (callId, generation, status) => {
    const current = get().activeCall;
    if (!current || current.callId !== callId || current.generation !== generation) return false;
    set({ activeCall: { ...current, status } });
    return true;
  },

  fenceTerminalCall: (callId, generation) => {
    const state = get();
    if (!state.accountId || !state.terminalFencesReady || state.generation !== generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    recordCallTerminalFence(terminalCallFences, callId);
    set({
      ...callsAfterTerminalFenceMerge(state, terminalCallFences),
      terminalCallFences,
    });
    persistTerminalCallFences(
      state.accountId,
      generation,
      state.terminalFenceEpoch,
      terminalCallFences,
    );
    return true;
  },

  isTerminalCallFenced: (callId, generation, elapsedNowMs) => {
    const state = get();
    if (!state.accountId || state.generation !== generation) return false;
    if (!state.terminalFencesReady) return true;
    const terminalCallFences = new Map(state.terminalCallFences);
    const fenced = isCallTerminalFenced(terminalCallFences, callId, elapsedNowMs);
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(
        state.accountId,
        generation,
        state.terminalFenceEpoch,
        terminalCallFences,
      );
    }
    return fenced;
  },

  hydrateTerminalCallFences: async (accountId, generation) => {
    ensureTerminalFenceSyncListeners();
    const initial = get();
    if (initial.accountId !== accountId || initial.generation !== generation) return false;
    const exclusive = await withTerminalFenceLock(accountId, () => {
      const current = get();
      if (current.accountId !== accountId || current.generation !== generation) {
        return { status: "stale" as const };
      }
      try {
        if (typeof localStorage === "undefined") return { status: "unavailable" as const };
        let epoch = localStorage.getItem(terminalFenceEpochKey(accountId));
        if (epoch !== null && !isValidTerminalFenceEpoch(epoch)) {
          epoch = newTerminalFenceEpoch();
          localStorage.setItem(terminalFenceEpochKey(accountId), epoch);
          removePersistedTerminalFencePayloads(accountId);
          return { status: "recovered-corrupt" as const, epoch };
        }
        if (current.terminalFenceEpoch && epoch !== current.terminalFenceEpoch) {
          return { status: "stale" as const };
        }
        if (!epoch) {
          epoch = newTerminalFenceEpoch();
          localStorage.setItem(terminalFenceEpochKey(accountId), epoch);
          if (localStorage.getItem(terminalFenceEpochKey(accountId)) !== epoch) {
            return { status: "unavailable" as const };
          }
        }
        const persisted = readPersistedTerminalFences(accountId, epoch);
        if (persisted.status !== "ok") return persisted;
        return { status: "hydrated" as const, epoch, persisted };
      } catch {
        return { status: "unavailable" as const };
      }
    });
    if (!exclusive.acquired) {
      let epoch = get().terminalFenceEpoch;
      try {
        epoch ??= typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(terminalFenceEpochKey(accountId));
      } catch {
        epoch = null;
      }
      if (epoch && activatePersistentFailClosedFence(accountId, generation, epoch)) return true;
      setTerminalFenceStoreUnavailable(accountId, generation, get().terminalFenceEpoch);
      return false;
    }
    const result = exclusive.value;
    if (result.status === "hydrated") {
      if (get().accountId !== accountId || get().generation !== generation) return false;
      set({ terminalFenceEpoch: result.epoch });
      return mergePersistedFencesIntoStore(
        accountId,
        generation,
        result.epoch,
        result.persisted,
      );
    }
    if (result.status === "recovered-corrupt") {
      if (get().accountId !== accountId || get().generation !== generation) return false;
      set({ terminalFenceEpoch: result.epoch });
      return activatePersistentFailClosedFence(accountId, generation, result.epoch);
    }
    if (result.status === "corrupt") {
      const epoch = get().terminalFenceEpoch
        ?? (() => {
          try {
            return localStorage.getItem(terminalFenceEpochKey(accountId));
          } catch {
            return null;
          }
        })();
      if (!epoch) {
        setTerminalFenceStoreUnavailable(accountId, generation, null);
        return false;
      }
      try {
        removePersistedTerminalFencePayloads(accountId);
      } catch {
        setTerminalFenceStoreUnavailable(accountId, generation, get().terminalFenceEpoch);
        return false;
      }
      set({ terminalFenceEpoch: epoch });
      return activatePersistentFailClosedFence(accountId, generation, epoch);
    }
    setTerminalFenceStoreUnavailable(accountId, generation, get().terminalFenceEpoch);
    return false;
  },

  synchronizeTerminalCallFences: async (accountId, generation) => {
    const pending = terminalFencePersistenceQueues.get(accountId);
    if (pending) await pending.catch(() => undefined);
    const state = get();
    const epoch = state.terminalFenceEpoch;
    if (
      state.accountId !== accountId
      || state.generation !== generation
      || !state.terminalFencesReady
      || !epoch
    ) return false;
    const exclusive = await withTerminalFenceLock(
      accountId,
      () => readPersistedTerminalFences(accountId, epoch),
    );
    if (!exclusive.acquired) {
      return activatePersistentFailClosedFence(accountId, generation, epoch);
    }
    if (exclusive.value.status === "ok") {
      return mergePersistedFencesIntoStore(
        accountId,
        generation,
        epoch,
        exclusive.value,
      );
    }
    if (exclusive.value.status === "corrupt") {
      try {
        removePersistedTerminalFencePayloads(accountId);
      } catch {
        setTerminalFenceStoreUnavailable(accountId, generation, epoch);
        return false;
      }
      return activatePersistentFailClosedFence(accountId, generation, epoch);
    }
    setTerminalFenceStoreUnavailable(accountId, generation, epoch);
    return false;
  },

  flushTerminalCallFencePersistence: async () => {
    while (terminalFencePersistenceQueues.size > 0) {
      await Promise.allSettled([...terminalFencePersistenceQueues.values()]);
    }
  },

  callSignalNowMs: () => rollbackSafeCallWallNowMs(callClock),

  clearCall: (callId, generation) => {
    const state = get();
    const current = state.activeCall;
    if (!current) return false;
    if (callId && current.callId !== callId) return false;
    if (generation !== undefined && current.generation !== generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    recordCallTerminalFence(terminalCallFences, current.callId);
    set({ activeCall: null, terminalCallFences });
    persistTerminalCallFences(
      current.accountId,
      current.generation,
      state.terminalFenceEpoch,
      terminalCallFences,
    );
    return true;
  },

  clearInvite: (callId, generation) => {
    const state = get();
    const current = state.incomingInvite;
    if (!current) return false;
    if (callId && current.callId !== callId) return false;
    if (generation !== undefined && current.generation !== generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    recordCallTerminalFence(terminalCallFences, current.callId);
    set({ incomingInvite: null, terminalCallFences });
    persistTerminalCallFences(
      current.accountId,
      current.generation,
      state.terminalFenceEpoch,
      terminalCallFences,
    );
    return true;
  },

  reset: () => {
    const accountId = get().accountId;
    if (accountId) invalidatePersistedTerminalFences(accountId);
    callClock = createRollbackSafeCallClock();
    set((state) => ({
      accountId: null,
      generation: state.generation + 1,
      terminalFenceEpoch: null,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
    }));
  },
}));
