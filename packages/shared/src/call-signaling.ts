import { z } from "zod";
import { utcTimestampSchema } from "./contract";

export const CALL_SIGNAL_VERSION = 1 as const;
export const CALL_SIGNAL_EVENT = "call-signal";
export const RING_SIGNAL_EVENT = "ring-invite";
export const MAX_CALL_SDP_LENGTH = 65_536;
export const MAX_ICE_CANDIDATE_LENGTH = 4_096;
export const MAX_CALL_EVENT_LIFETIME_MS = 45_000;
export const MAX_CALL_CLOCK_SKEW_MS = 5_000;
export const CALL_SIGNAL_ATTEMPT_TIMEOUT_MS = 8_000;
export const CALL_TERMINAL_FENCE_RETENTION_MS = 60_000;
export const MAX_CALL_TERMINAL_FENCES = 64;
export const MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES = MAX_CALL_TERMINAL_FENCES + 1;

const CALL_TERMINAL_FENCE_OVERFLOW_KEY = "terminal-fence-overflow";
const CALL_TERMINAL_FENCE_STORAGE_VERSION = 1;

export const canonicalCallUuidSchema = z.uuid().refine(
  (value) => value === value.toLowerCase(),
  "UUID must use canonical lowercase form",
);

export const callPeerInfoSchema = z.strictObject({
  id: canonicalCallUuidSchema,
  display_name: z.string().max(50).nullable(),
  username: z.string().min(1).max(64),
  avatar_url: z.string().max(2_048).nullable(),
});

export const callSdpOfferSchema = z.strictObject({
  type: z.literal("offer"),
  sdp: z.string().min(1).max(MAX_CALL_SDP_LENGTH),
});

export const callSdpAnswerSchema = z.strictObject({
  type: z.literal("answer"),
  sdp: z.string().min(1).max(MAX_CALL_SDP_LENGTH),
});

export const callIceCandidateSchema = z.strictObject({
  candidate: z.string().min(1).max(MAX_ICE_CANDIDATE_LENGTH),
  sdpMid: z.string().max(256).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(65_535).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

const commandBase = {
  version: z.literal(CALL_SIGNAL_VERSION),
  commandId: canonicalCallUuidSchema,
  callId: canonicalCallUuidSchema,
};

const capabilityCommandBase = {
  ...commandBase,
  capability: canonicalCallUuidSchema,
};

export const callSignalCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...commandBase, type: z.literal("invite") }),
  z.strictObject({ ...capabilityCommandBase, type: z.literal("cancel") }),
  z.strictObject({
    ...commandBase,
    type: z.literal("recover-cancel"),
    inviteCommandId: canonicalCallUuidSchema,
  }),
  z.strictObject({ ...capabilityCommandBase, type: z.literal("accept") }),
  z.strictObject({
    ...capabilityCommandBase,
    type: z.literal("reject"),
    reason: z.enum(["declined", "busy"]),
  }),
  z.strictObject({
    ...capabilityCommandBase,
    type: z.literal("offer"),
    sdp: callSdpOfferSchema,
  }),
  z.strictObject({
    ...capabilityCommandBase,
    type: z.literal("answer"),
    sdp: callSdpAnswerSchema,
  }),
  z.strictObject({
    ...capabilityCommandBase,
    type: z.literal("ice"),
    candidate: callIceCandidateSchema,
  }),
  z.strictObject({ ...capabilityCommandBase, type: z.literal("end") }),
  z.strictObject({ ...capabilityCommandBase, type: z.literal("heartbeat") }),
]);

const eventBase = {
  version: z.literal(CALL_SIGNAL_VERSION),
  commandId: canonicalCallUuidSchema,
  callId: canonicalCallUuidSchema,
  threadId: canonicalCallUuidSchema,
  capability: canonicalCallUuidSchema,
  fromUserId: canonicalCallUuidSchema,
  toUserId: canonicalCallUuidSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  issuedAt: utcTimestampSchema,
  expiresAt: utcTimestampSchema,
};

export const callSignalEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...eventBase,
    type: z.literal("invite"),
    fromUser: callPeerInfoSchema,
  }),
  z.strictObject({ ...eventBase, type: z.literal("cancel") }),
  z.strictObject({ ...eventBase, type: z.literal("accept") }),
  z.strictObject({
    ...eventBase,
    type: z.literal("reject"),
    reason: z.enum(["declined", "busy"]),
  }),
  z.strictObject({ ...eventBase, type: z.literal("offer"), sdp: callSdpOfferSchema }),
  z.strictObject({ ...eventBase, type: z.literal("answer"), sdp: callSdpAnswerSchema }),
  z.strictObject({ ...eventBase, type: z.literal("ice"), candidate: callIceCandidateSchema }),
  z.strictObject({ ...eventBase, type: z.literal("end") }),
]);

export const callSignalAckSchema = z.strictObject({
  version: z.literal(CALL_SIGNAL_VERSION),
  callId: canonicalCallUuidSchema,
  threadId: canonicalCallUuidSchema,
  capability: canonicalCallUuidSchema,
  acceptedSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expiresAt: utcTimestampSchema,
  replayed: z.boolean(),
});

export type CallPeerInfo = z.infer<typeof callPeerInfoSchema>;
export type CallSignalCommand = z.infer<typeof callSignalCommandSchema>;
export type CallSignalEvent = z.infer<typeof callSignalEventSchema>;
export type CallSignalAck = z.infer<typeof callSignalAckSchema>;
export type CallDirection = "outgoing" | "incoming";
export type CallStatus = "calling" | "connecting" | "connected" | "ended" | "failed";

function pruneCallTerminalFences(
  fences: Map<string, number>,
  elapsedNowMs: number,
) {
  for (const [callId, retainUntilMs] of fences) {
    if (retainUntilMs <= elapsedNowMs) fences.delete(callId);
  }
}

export function callTerminalFenceElapsedNowMs() {
  const elapsedNowMs = globalThis.performance?.now();
  // A non-advancing fallback retains fences until the account generation is
  // reset. It is safer than reopening a call identifier on a wall-clock jump.
  return typeof elapsedNowMs === "number" && Number.isFinite(elapsedNowMs)
    ? elapsedNowMs
    : 0;
}

export type RollbackSafeCallClock = {
  wallAnchorMs: number;
  elapsedAnchorMs: number;
  maxObservedWallMs: number;
};

export function createRollbackSafeCallClock(
  wallNowMs = Date.now(),
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
): RollbackSafeCallClock {
  return {
    wallAnchorMs: wallNowMs,
    elapsedAnchorMs: elapsedNowMs,
    maxObservedWallMs: wallNowMs,
  };
}

export function rollbackSafeCallWallNowMs(
  clock: RollbackSafeCallClock,
  wallNowMs = Date.now(),
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
) {
  const elapsedWallMs = clock.wallAnchorMs
    + Math.max(0, elapsedNowMs - clock.elapsedAnchorMs);
  clock.maxObservedWallMs = Math.max(
    clock.maxObservedWallMs,
    wallNowMs,
    elapsedWallMs,
  );
  return clock.maxObservedWallMs;
}

export function raiseRollbackSafeCallClockFloor(
  clock: RollbackSafeCallClock,
  wallFloorMs: number,
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
) {
  const floor = Math.max(
    rollbackSafeCallWallNowMs(clock, Date.now(), elapsedNowMs),
    wallFloorMs,
  );
  clock.wallAnchorMs = floor;
  clock.elapsedAnchorMs = elapsedNowMs;
  clock.maxObservedWallMs = floor;
}

export function recordCallTerminalFence(
  fences: Map<string, number>,
  callId: string,
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
) {
  pruneCallTerminalFences(fences, elapsedNowMs);
  const deadline = elapsedNowMs + CALL_TERMINAL_FENCE_RETENTION_MS;
  const existing = fences.get(callId);
  if (existing !== undefined) {
    fences.set(callId, Math.max(existing, deadline));
    return;
  }

  const overflowDeadline = fences.get(CALL_TERMINAL_FENCE_OVERFLOW_KEY);
  if (overflowDeadline !== undefined) {
    fences.set(CALL_TERMINAL_FENCE_OVERFLOW_KEY, Math.max(overflowDeadline, deadline));
    return;
  }

  if (fences.size < MAX_CALL_TERMINAL_FENCES) {
    fences.set(callId, deadline);
    return;
  }

  // Never evict an unexpired immutable call ID. If the server-side rate bound
  // is exceeded, one overflow deadline fail-closes every invite while keeping
  // storage absolutely bounded.
  fences.set(
    CALL_TERMINAL_FENCE_OVERFLOW_KEY,
    Math.max(deadline, ...fences.values()),
  );
}

export function failClosedCallTerminalFences(
  fences: Map<string, number>,
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
) {
  pruneCallTerminalFences(fences, elapsedNowMs);
  const deadline = elapsedNowMs + CALL_TERMINAL_FENCE_RETENTION_MS;
  fences.set(
    CALL_TERMINAL_FENCE_OVERFLOW_KEY,
    Math.max(fences.get(CALL_TERMINAL_FENCE_OVERFLOW_KEY) ?? 0, deadline),
  );
}

export function isCallTerminalFenced(
  fences: Map<string, number>,
  callId: string,
  elapsedNowMs = callTerminalFenceElapsedNowMs(),
) {
  pruneCallTerminalFences(fences, elapsedNowMs);
  // Call identifiers are immutable session identities. Once a valid terminal
  // signal is observed, no later delivery may reopen that identifier.
  return fences.has(CALL_TERMINAL_FENCE_OVERFLOW_KEY) || fences.has(callId);
}

const persistedCallTerminalFenceTiming = {
  recordedAtWallMs: z.number().int().nonnegative(),
  retainUntilWallMs: z.number().int().positive(),
};

function validPersistedCallTerminalFenceLifetime(entry: {
  recordedAtWallMs: number;
  retainUntilWallMs: number;
}) {
  return entry.retainUntilWallMs > entry.recordedAtWallMs
    && entry.retainUntilWallMs - entry.recordedAtWallMs <= CALL_TERMINAL_FENCE_RETENTION_MS;
}

const persistedCallTerminalFenceEntrySchema = z.strictObject({
  callId: z.string().min(1).max(128),
  ...persistedCallTerminalFenceTiming,
}).refine(
  validPersistedCallTerminalFenceLifetime,
  "Invalid terminal fence lifetime",
);

const persistedCallTerminalFenceOverflowSchema = z.strictObject({
  ...persistedCallTerminalFenceTiming,
}).refine(
  validPersistedCallTerminalFenceLifetime,
  "Invalid terminal fence lifetime",
);

const persistedCallTerminalFencesSchema = z.strictObject({
  version: z.literal(CALL_TERMINAL_FENCE_STORAGE_VERSION),
  accountId: canonicalCallUuidSchema,
  sessionEpoch: z.string().min(1).max(128).optional(),
  entries: z.array(persistedCallTerminalFenceEntrySchema).max(MAX_CALL_TERMINAL_FENCES),
  overflow: persistedCallTerminalFenceOverflowSchema.nullable(),
});

export type RestoredCallTerminalFences = {
  valid: boolean;
  fences: Map<string, number>;
  wallClockFloorMs: number;
};

export function serializeCallTerminalFences(
  fences: Map<string, number>,
  accountId: string,
  elapsedNowMs: number,
  rollbackSafeWallNowMs: number,
  sessionEpoch?: string,
) {
  const entries: Array<z.infer<typeof persistedCallTerminalFenceEntrySchema>> = [];
  let overflow: z.infer<typeof persistedCallTerminalFencesSchema>["overflow"] = null;
  for (const [callId, deadline] of fences) {
    const remainingMs = Math.min(
      CALL_TERMINAL_FENCE_RETENTION_MS,
      Math.max(0, deadline - elapsedNowMs),
    );
    if (remainingMs <= 0) continue;
    const recordedAtWallMs = Math.trunc(rollbackSafeWallNowMs);
    const persisted = {
      recordedAtWallMs,
      retainUntilWallMs: recordedAtWallMs + Math.max(1, Math.ceil(remainingMs)),
    };
    if (callId === CALL_TERMINAL_FENCE_OVERFLOW_KEY) {
      overflow = persisted;
    } else {
      entries.push({ callId, ...persisted });
    }
  }
  if (entries.length === 0 && !overflow) return null;
  return JSON.stringify(persistedCallTerminalFencesSchema.parse({
    version: CALL_TERMINAL_FENCE_STORAGE_VERSION,
    accountId,
    ...(sessionEpoch ? { sessionEpoch } : {}),
    entries,
    overflow,
  }));
}

export function restoreCallTerminalFences(
  serialized: string | null,
  accountId: string,
  elapsedNowMs: number,
  rollbackSafeWallNowMs: number,
  expectedSessionEpoch?: string,
): RestoredCallTerminalFences {
  if (!serialized) {
    return { valid: true, fences: new Map(), wallClockFloorMs: rollbackSafeWallNowMs };
  }
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch {
    return { valid: false, fences: new Map(), wallClockFloorMs: rollbackSafeWallNowMs };
  }
  const parsed = persistedCallTerminalFencesSchema.safeParse(input);
  if (
    !parsed.success
    || parsed.data.accountId !== accountId
    || (expectedSessionEpoch !== undefined && parsed.data.sessionEpoch !== expectedSessionEpoch)
  ) {
    return { valid: false, fences: new Map(), wallClockFloorMs: rollbackSafeWallNowMs };
  }

  const persistedEntries = parsed.data.overflow
    ? [...parsed.data.entries, { callId: CALL_TERMINAL_FENCE_OVERFLOW_KEY, ...parsed.data.overflow }]
    : parsed.data.entries;
  const wallClockFloorMs = Math.max(
    rollbackSafeWallNowMs,
    ...persistedEntries.map((entry) => entry.recordedAtWallMs),
  );
  const fences = new Map<string, number>();
  for (const entry of persistedEntries) {
    const remainingMs = Math.min(
      CALL_TERMINAL_FENCE_RETENTION_MS,
      entry.retainUntilWallMs - wallClockFloorMs,
    );
    if (remainingMs > 0) fences.set(entry.callId, elapsedNowMs + remainingMs);
  }
  return { valid: true, fences, wallClockFloorMs };
}

export type IncomingCallInviteAction = "ignore" | "reject-busy" | "ring";

export function incomingCallInviteAction(
  callId: string,
  activeCallId: string | null | undefined,
  incomingInviteCallId: string | null | undefined,
): IncomingCallInviteAction {
  if (activeCallId === callId || incomingInviteCallId === callId) return "ignore";
  if (activeCallId || incomingInviteCallId) return "reject-busy";
  return "ring";
}

export function callTerminalCommandTypes(
  direction: CallDirection,
  status: CallStatus,
): ("cancel" | "end" | "reject")[] {
  if (status === "connected") return ["end"];
  return direction === "outgoing" ? ["cancel", "end"] : ["end", "reject"];
}

export type CallSignalScope = {
  accountId: string;
  threadId?: string;
  callId?: string;
  peerUserId?: string;
  capability?: string;
  lastSequence?: number;
  nowMs?: number;
};

export type CallSignalRejection =
  | "malformed"
  | "expired"
  | "future"
  | "lifetime"
  | "wrong-recipient"
  | "wrong-thread"
  | "wrong-call"
  | "wrong-sender"
  | "wrong-capability"
  | "replay";

export type ScopedCallSignalResult =
  | { success: true; event: CallSignalEvent }
  | { success: false; reason: CallSignalRejection };

export function parseScopedCallSignalEvent(
  input: unknown,
  scope: CallSignalScope,
): ScopedCallSignalResult {
  const parsed = callSignalEventSchema.safeParse(input);
  if (!parsed.success) return { success: false, reason: "malformed" };

  const event = parsed.data;
  const now = scope.nowMs ?? Date.now();
  const issuedAt = Date.parse(event.issuedAt);
  const expiresAt = Date.parse(event.expiresAt);
  if (expiresAt <= now) return { success: false, reason: "expired" };
  if (issuedAt > now + MAX_CALL_CLOCK_SKEW_MS) return { success: false, reason: "future" };
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_CALL_EVENT_LIFETIME_MS) {
    return { success: false, reason: "lifetime" };
  }
  if (event.toUserId !== scope.accountId) return { success: false, reason: "wrong-recipient" };
  if (scope.threadId && event.threadId !== scope.threadId) {
    return { success: false, reason: "wrong-thread" };
  }
  if (scope.callId && event.callId !== scope.callId) {
    return { success: false, reason: "wrong-call" };
  }
  if (scope.peerUserId && event.fromUserId !== scope.peerUserId) {
    return { success: false, reason: "wrong-sender" };
  }
  if (scope.capability && event.capability !== scope.capability) {
    return { success: false, reason: "wrong-capability" };
  }
  if (scope.lastSequence !== undefined && event.sequence <= scope.lastSequence) {
    return { success: false, reason: "replay" };
  }
  if (event.type === "invite" && event.fromUser.id !== event.fromUserId) {
    return { success: false, reason: "wrong-sender" };
  }
  return { success: true, event };
}

export function callSignalCommandFingerprint(command: CallSignalCommand) {
  return JSON.stringify(callSignalCommandSchema.parse(command));
}
