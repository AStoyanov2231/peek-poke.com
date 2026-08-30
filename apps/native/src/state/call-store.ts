import { create } from "zustand";
import {
  callTerminalFenceElapsedNowMs,
  createRollbackSafeCallClock,
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

const TERMINAL_FENCE_STORAGE_PREFIX = "peekpoke-call-terminal-fences-";
let callClock = createRollbackSafeCallClock();
const terminalFencePersistenceQueues = new Map<string, Promise<void>>();
let acceptCallInFlight: { key: string; promise: Promise<boolean> } | null = null;

function terminalFenceStorageKey(accountId: string) {
  return `${TERMINAL_FENCE_STORAGE_PREFIX}${accountId}`;
}

function enqueueTerminalFencePersistence(
  accountId: string,
  operation: () => Promise<void>,
) {
  const queued = (terminalFencePersistenceQueues.get(accountId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  terminalFencePersistenceQueues.set(accountId, queued);
  void queued.finally(() => {
    if (terminalFencePersistenceQueues.get(accountId) === queued) {
      terminalFencePersistenceQueues.delete(accountId);
    }
  }).catch(() => undefined);
  return queued;
}

function persistTerminalCallFences(accountId: string, fences: Map<string, number>) {
  const elapsedNowMs = callTerminalFenceElapsedNowMs();
  const serialized = serializeCallTerminalFences(
    fences,
    accountId,
    elapsedNowMs,
    rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
  );
  void enqueueTerminalFencePersistence(accountId, async () => {
    const { secureStorage } = await import("@/lib/secure-storage");
    if (serialized) await secureStorage.setItem(terminalFenceStorageKey(accountId), serialized);
    else await secureStorage.removeItem(terminalFenceStorageKey(accountId));
  }).catch(() => undefined);
}

function removePersistedTerminalCallFences(accountId: string) {
  return enqueueTerminalFencePersistence(accountId, async () => {
    const { secureStorage } = await import("@/lib/secure-storage");
    await secureStorage.removeItem(terminalFenceStorageKey(accountId));
  });
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

type CallState = {
  accountId: string | null;
  generation: number;
  activeCall: ActiveCall | null;
  incomingInvite: IncomingInvite | null;
  terminalCallFences: Map<string, number>;
  terminalFencesReady: boolean;
  observeAccount: (accountId: string | null) => void;
  startOutgoingCall: (accountId: string, threadId: string, callId: string, peer: CallPeerInfo) => boolean;
  setIncomingInvite: (invite: IncomingInvite) => boolean;
  acceptCall: (callId: string, generation: number) => Promise<boolean>;
  declineCall: () => void;
  setCallSession: (callId: string, generation: number, capability: string, sequence: number) => boolean;
  advanceCallSequence: (callId: string, generation: number, sequence: number) => boolean;
  setCallStatus: (callId: string, generation: number, status: CallStatus) => boolean;
  fenceTerminalCall: (callId: string, generation: number) => boolean;
  isTerminalCallFenced: (callId: string, generation: number, elapsedNowMs?: number) => boolean;
  hydrateTerminalCallFences: (accountId: string, generation: number) => Promise<boolean>;
  synchronizeTerminalCallFences: (accountId: string, generation: number) => Promise<boolean>;
  callSignalNowMs: () => number;
  clearCall: (callId?: string, generation?: number) => boolean;
  clearInvite: (callId?: string, generation?: number) => boolean;
  reset: () => void;
};

function callsAfterTerminalFenceMerge(
  state: Pick<CallState, "activeCall" | "incomingInvite">,
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

export const useCallStore = create<CallState>((set, get) => ({
  accountId: null,
  generation: 0,
  activeCall: null,
  incomingInvite: null,
  terminalCallFences: new Map(),
  terminalFencesReady: true,
  observeAccount: (accountId) => {
    const previousAccountId = get().accountId;
    if (previousAccountId === accountId) return;
    if (previousAccountId) {
      void removePersistedTerminalCallFences(previousAccountId).catch(() => undefined);
    }
    callClock = createRollbackSafeCallClock();
    set((state) => ({
      accountId,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: accountId === null,
    }));
  },
  startOutgoingCall: (accountId, threadId, callId, peer) => {
    const state = get();
    if (state.accountId !== accountId || state.activeCall) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    if (isCallTerminalFenced(terminalCallFences, callId)) return false;
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(accountId, terminalCallFences);
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
  setIncomingInvite: (incomingInvite) => {
    const state = get();
    if (state.accountId !== incomingInvite.accountId || state.generation !== incomingInvite.generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    if (isCallTerminalFenced(terminalCallFences, incomingInvite.callId)) return false;
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(incomingInvite.accountId, terminalCallFences);
    }
    set({ incomingInvite });
    return true;
  },
  acceptCall: async (callId, generation) => {
    const state = get();
    const invite = state.incomingInvite;
    if (
      !invite
      || invite.callId !== callId
      || invite.generation !== generation
      || state.accountId !== invite.accountId
      || state.generation !== invite.generation
    ) return false;
    const key = `${invite.accountId}:${generation}:${callId}`;
    if (acceptCallInFlight?.key === key) return acceptCallInFlight.promise;
    const promise = (async () => {
      if (!await get().synchronizeTerminalCallFences(invite.accountId, generation)) return false;
      const current = get();
      const currentInvite = current.incomingInvite;
      if (
        !currentInvite
        || currentInvite.callId !== callId
        || currentInvite.generation !== generation
        || currentInvite.accountId !== invite.accountId
        || current.accountId !== invite.accountId
        || current.generation !== generation
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
    const incomingInvite = get().incomingInvite;
    if (!incomingInvite) return;
    const terminalCallFences = new Map(get().terminalCallFences);
    recordCallTerminalFence(terminalCallFences, incomingInvite.callId);
    set({ incomingInvite: null, terminalCallFences });
    persistTerminalCallFences(incomingInvite.accountId, terminalCallFences);
  },
  setCallSession: (callId, generation, capability, sequence) => {
    const activeCall = get().activeCall;
    if (!activeCall || activeCall.callId !== callId || activeCall.generation !== generation) return false;
    set({ activeCall: { ...activeCall, capability, lastSequence: Math.max(activeCall.lastSequence, sequence) } });
    return true;
  },
  advanceCallSequence: (callId, generation, sequence) => {
    const activeCall = get().activeCall;
    if (!activeCall || activeCall.callId !== callId || activeCall.generation !== generation) return false;
    if (sequence <= activeCall.lastSequence) return false;
    set({ activeCall: { ...activeCall, lastSequence: sequence } });
    return true;
  },
  setCallStatus: (callId, generation, status) => {
    const activeCall = get().activeCall;
    if (!activeCall || activeCall.callId !== callId || activeCall.generation !== generation) return false;
    set({ activeCall: { ...activeCall, status } });
    return true;
  },
  fenceTerminalCall: (callId, generation) => {
    const state = get();
    if (!state.accountId || state.generation !== generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    recordCallTerminalFence(terminalCallFences, callId);
    set({
      ...callsAfterTerminalFenceMerge(state, terminalCallFences),
      terminalCallFences,
    });
    persistTerminalCallFences(state.accountId, terminalCallFences);
    return true;
  },
  isTerminalCallFenced: (callId, generation, elapsedNowMs) => {
    const state = get();
    if (!state.accountId || state.generation !== generation) return false;
    const terminalCallFences = new Map(state.terminalCallFences);
    const fenced = isCallTerminalFenced(terminalCallFences, callId, elapsedNowMs);
    if (terminalCallFences.size !== state.terminalCallFences.size) {
      set({ terminalCallFences });
      persistTerminalCallFences(state.accountId, terminalCallFences);
    }
    return fenced;
  },
  hydrateTerminalCallFences: async (accountId, generation) => {
    const state = get();
    if (state.accountId !== accountId || state.generation !== generation) return false;
    let serialized: string | null = null;
    try {
      await terminalFencePersistenceQueues.get(accountId);
      const { secureStorage } = await import("@/lib/secure-storage");
      serialized = await secureStorage.getItem(terminalFenceStorageKey(accountId));
    } catch {
      serialized = null;
    }
    if (get().accountId !== accountId || get().generation !== generation) return false;
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const restored = restoreCallTerminalFences(
      serialized,
      accountId,
      elapsedNowMs,
      rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
    );
    if (!restored.valid) {
      try {
        await removePersistedTerminalCallFences(accountId);
      } catch {
        // Keep hydration fail-closed even when the platform storage is unavailable.
      }
    }
    if (get().accountId !== accountId || get().generation !== generation) return false;
    raiseRollbackSafeCallClockFloor(callClock, restored.wallClockFloorMs, elapsedNowMs);
    const terminalCallFences = new Map(restored.fences);
    for (const [callId, deadline] of get().terminalCallFences) {
      terminalCallFences.set(callId, Math.max(terminalCallFences.get(callId) ?? 0, deadline));
    }
    const current = get();
    set({
      ...callsAfterTerminalFenceMerge(current, terminalCallFences),
      terminalCallFences,
      terminalFencesReady: true,
    });
    return true;
  },
  synchronizeTerminalCallFences: async (accountId, generation) => {
    const state = get();
    if (state.accountId !== accountId || state.generation !== generation) return false;
    let serialized: string | null;
    try {
      await terminalFencePersistenceQueues.get(accountId);
      const { secureStorage } = await import("@/lib/secure-storage");
      serialized = await secureStorage.getItem(terminalFenceStorageKey(accountId));
    } catch {
      if (get().accountId === accountId && get().generation === generation) {
        set({ incomingInvite: null, terminalFencesReady: false });
      }
      return false;
    }
    if (get().accountId !== accountId || get().generation !== generation) return false;
    const elapsedNowMs = callTerminalFenceElapsedNowMs();
    const restored = restoreCallTerminalFences(
      serialized,
      accountId,
      elapsedNowMs,
      rollbackSafeCallWallNowMs(callClock, Date.now(), elapsedNowMs),
    );
    if (!restored.valid) {
      set({ incomingInvite: null, terminalFencesReady: false });
      return false;
    }
    raiseRollbackSafeCallClockFloor(callClock, restored.wallClockFloorMs, elapsedNowMs);
    const current = get();
    if (current.accountId !== accountId || current.generation !== generation) return false;
    const terminalCallFences = new Map(restored.fences);
    for (const [callId, deadline] of current.terminalCallFences) {
      terminalCallFences.set(callId, Math.max(terminalCallFences.get(callId) ?? 0, deadline));
    }
    set({
      ...callsAfterTerminalFenceMerge(current, terminalCallFences),
      terminalCallFences,
      terminalFencesReady: true,
    });
    return true;
  },
  callSignalNowMs: () => rollbackSafeCallWallNowMs(callClock),
  clearCall: (callId, generation) => {
    const activeCall = get().activeCall;
    if (!activeCall || (callId && activeCall.callId !== callId) || (generation !== undefined && activeCall.generation !== generation)) return false;
    const terminalCallFences = new Map(get().terminalCallFences);
    recordCallTerminalFence(terminalCallFences, activeCall.callId);
    set({ activeCall: null, terminalCallFences });
    persistTerminalCallFences(activeCall.accountId, terminalCallFences);
    return true;
  },
  clearInvite: (callId, generation) => {
    const invite = get().incomingInvite;
    if (!invite || (callId && invite.callId !== callId) || (generation !== undefined && invite.generation !== generation)) return false;
    const terminalCallFences = new Map(get().terminalCallFences);
    recordCallTerminalFence(terminalCallFences, invite.callId);
    set({ incomingInvite: null, terminalCallFences });
    persistTerminalCallFences(invite.accountId, terminalCallFences);
    return true;
  },
  reset: () => {
    const accountId = get().accountId;
    if (accountId) void removePersistedTerminalCallFences(accountId).catch(() => undefined);
    callClock = createRollbackSafeCallClock();
    set((state) => ({
      accountId: null,
      generation: state.generation + 1,
      activeCall: null,
      incomingInvite: null,
      terminalCallFences: new Map(),
      terminalFencesReady: true,
    }));
  },
}));
