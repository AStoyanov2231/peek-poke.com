import { describe, expect, it, vi } from "vitest";
import {
  callTerminalCommandTypes,
  CALL_TERMINAL_FENCE_RETENTION_MS,
  createRollbackSafeCallClock,
  MAX_CALL_CLOCK_SKEW_MS,
  MAX_CALL_EVENT_LIFETIME_MS,
  MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES,
  MAX_CALL_TERMINAL_FENCES,
  MAX_CALL_SDP_LENGTH,
  callSignalCommandSchema,
  callSignalEventSchema,
  isCallTerminalFenced,
  parseScopedCallSignalEvent,
  recordCallTerminalFence,
  restoreCallTerminalFences,
  rollbackSafeCallWallNowMs,
  serializeCallTerminalFences,
} from "@peekpoke/shared";

const CALLER_ID = "11111111-1111-4111-8111-111111111111";
const CALLEE_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const CALL_ID = "44444444-4444-4444-8444-444444444444";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const COMMAND_ID = "66666666-6666-4666-8666-666666666666";
const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);

function eventBase(sequence: number, fromUserId: string, toUserId: string) {
  return {
    version: 1,
    commandId: COMMAND_ID,
    callId: CALL_ID,
    threadId: THREAD_ID,
    capability: CAPABILITY,
    fromUserId,
    toUserId,
    sequence,
    issuedAt: new Date(NOW - 1_000).toISOString(),
    expiresAt: new Date(NOW + 14_000).toISOString(),
  } as const;
}

function callerScope(lastSequence: number) {
  return {
    accountId: CALLER_ID,
    threadId: THREAD_ID,
    callId: CALL_ID,
    peerUserId: CALLEE_ID,
    capability: CAPABILITY,
    lastSequence,
    nowMs: NOW,
  };
}

function calleeScope(lastSequence: number) {
  return {
    accountId: CALLEE_ID,
    threadId: THREAD_ID,
    callId: CALL_ID,
    peerUserId: CALLER_ID,
    capability: CAPABILITY,
    lastSequence,
    nowMs: NOW,
  };
}

describe("cross-platform call signaling contract", () => {
  it("chooses bounded terminal fallbacks for every pre-connected direction", () => {
    expect(callTerminalCommandTypes("outgoing", "calling")).toEqual(["cancel", "end"]);
    expect(callTerminalCommandTypes("outgoing", "failed")).toEqual(["cancel", "end"]);
    expect(callTerminalCommandTypes("incoming", "connecting")).toEqual(["end", "reject"]);
    expect(callTerminalCommandTypes("incoming", "failed")).toEqual(["end", "reject"]);
    expect(callTerminalCommandTypes("incoming", "connected")).toEqual(["end"]);
  });

  it("converges through the same strict happy-path handshake on both peers", () => {
    const accept = { ...eventBase(2, CALLEE_ID, CALLER_ID), type: "accept" };
    expect(parseScopedCallSignalEvent(accept, callerScope(1))).toEqual({ success: true, event: accept });

    const offer = {
      ...eventBase(3, CALLER_ID, CALLEE_ID),
      type: "offer",
      sdp: { type: "offer", sdp: "v=0\r\n" },
    };
    expect(parseScopedCallSignalEvent(offer, calleeScope(2))).toEqual({ success: true, event: offer });

    const ice = {
      ...eventBase(4, CALLER_ID, CALLEE_ID),
      type: "ice",
      candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    };
    expect(parseScopedCallSignalEvent(ice, calleeScope(3))).toEqual({ success: true, event: ice });

    const answer = {
      ...eventBase(5, CALLEE_ID, CALLER_ID),
      type: "answer",
      sdp: { type: "answer", sdp: "v=0\r\n" },
    };
    expect(parseScopedCallSignalEvent(answer, callerScope(4))).toEqual({ success: true, event: answer });

    const end = { ...eventBase(6, CALLER_ID, CALLEE_ID), type: "end" };
    expect(parseScopedCallSignalEvent(end, calleeScope(5))).toEqual({ success: true, event: end });
  });

  it("rejects malformed, oversized, and server-owned fields at the command boundary", () => {
    const invite = {
      version: 1,
      type: "invite",
      commandId: COMMAND_ID,
      callId: CALL_ID,
    };
    expect(callSignalCommandSchema.safeParse(invite).success).toBe(true);
    expect(callSignalCommandSchema.safeParse({ ...invite, fromUserId: CALLER_ID }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({ ...invite, capability: CAPABILITY }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "heartbeat",
      capability: CAPABILITY,
    }).success).toBe(true);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "recover-cancel",
      inviteCommandId: COMMAND_ID,
    }).success).toBe(true);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "recover-cancel",
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "recover-cancel",
      inviteCommandId: COMMAND_ID,
      capability: CAPABILITY,
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "recover-cancel",
      inviteCommandId: THREAD_ID,
      recipientId: CALLEE_ID,
    }).success).toBe(false);
    expect(callSignalCommandSchema.safeParse({
      ...invite,
      type: "offer",
      capability: CAPABILITY,
      sdp: { type: "offer", sdp: "x".repeat(MAX_CALL_SDP_LENGTH + 1) },
    }).success).toBe(false);
  });

  it.each([
    ["wrong-recipient", { ...eventBase(2, CALLEE_ID, CALLEE_ID), type: "accept" }],
    ["wrong-thread", { ...eventBase(2, CALLEE_ID, CALLER_ID), threadId: CALL_ID, type: "accept" }],
    ["wrong-call", { ...eventBase(2, CALLEE_ID, CALLER_ID), callId: THREAD_ID, type: "accept" }],
    ["wrong-sender", { ...eventBase(2, CALLER_ID, CALLER_ID), type: "accept" }],
    ["wrong-capability", { ...eventBase(2, CALLEE_ID, CALLER_ID), capability: CALL_ID, type: "accept" }],
  ] as const)("rejects %s scope attacks before mutation", (reason, event) => {
    expect(parseScopedCallSignalEvent(event, callerScope(1))).toEqual({ success: false, reason });
  });

  it("rejects replay, expiry, future issue time, excessive lifetime, and strict extras", () => {
    const valid = { ...eventBase(2, CALLEE_ID, CALLER_ID), type: "accept" };
    expect(parseScopedCallSignalEvent(valid, callerScope(2))).toEqual({ success: false, reason: "replay" });
    expect(parseScopedCallSignalEvent({
      ...valid,
      expiresAt: new Date(NOW).toISOString(),
    }, callerScope(1))).toEqual({ success: false, reason: "expired" });
    expect(parseScopedCallSignalEvent({
      ...valid,
      issuedAt: new Date(NOW + 6_000).toISOString(),
      expiresAt: new Date(NOW + 20_000).toISOString(),
    }, callerScope(1))).toEqual({ success: false, reason: "future" });
    expect(parseScopedCallSignalEvent({
      ...valid,
      issuedAt: new Date(NOW - 1_000).toISOString(),
      expiresAt: new Date(NOW - 1_000 + MAX_CALL_EVENT_LIFETIME_MS + 1).toISOString(),
    }, callerScope(1))).toEqual({ success: false, reason: "lifetime" });
    expect(parseScopedCallSignalEvent({ ...valid, attackerControlled: true }, callerScope(1))).toEqual({
      success: false,
      reason: "malformed",
    });
  });

  it("binds ring identity to the authenticated sender metadata", () => {
    const invite = {
      ...eventBase(1, CALLER_ID, CALLEE_ID),
      type: "invite",
      fromUser: {
        id: CALLEE_ID,
        display_name: "Mallory",
        username: "mallory",
        avatar_url: null,
      },
    };
    expect(parseScopedCallSignalEvent(invite, { accountId: CALLEE_ID, nowMs: NOW })).toEqual({
      success: false,
      reason: "wrong-sender",
    });
  });

  it("retains more than 32 simultaneous terminal IDs for the full invite lifetime", () => {
    const fences = new Map<string, number>();
    recordCallTerminalFence(fences, CALL_ID, NOW);
    recordCallTerminalFence(fences, CALL_ID, NOW);
    for (let index = 0; index < 40; index += 1) {
      recordCallTerminalFence(fences, `call-${index}`, NOW);
    }

    expect(isCallTerminalFenced(fences, CALL_ID, NOW)).toBe(true);
    expect(isCallTerminalFenced(fences, THREAD_ID, NOW)).toBe(false);
    expect(fences.size).toBe(41);
    expect(CALL_TERMINAL_FENCE_RETENTION_MS).toBeGreaterThan(
      MAX_CALL_EVENT_LIFETIME_MS + MAX_CALL_CLOCK_SKEW_MS,
    );
    expect(isCallTerminalFenced(
      fences,
      CALL_ID,
      NOW + MAX_CALL_EVENT_LIFETIME_MS + MAX_CALL_CLOCK_SKEW_MS + 1,
    )).toBe(true);
  });

  it("fail-closes overflow without evicting old or new suppression", () => {
    const fences = new Map<string, number>();
    for (let index = 0; index < MAX_CALL_TERMINAL_FENCES; index += 1) {
      recordCallTerminalFence(fences, `call-${index}`, NOW);
    }
    recordCallTerminalFence(fences, "overflow-call", NOW);

    expect(fences.size).toBe(MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES);
    expect(isCallTerminalFenced(fences, "call-0", NOW + 1)).toBe(true);
    expect(isCallTerminalFenced(fences, "overflow-call", NOW + 1)).toBe(true);
    expect(isCallTerminalFenced(fences, "unseen-call", NOW + 1)).toBe(true);
    expect(isCallTerminalFenced(
      fences,
      "unseen-call",
      NOW + CALL_TERMINAL_FENCE_RETENTION_MS + 1,
    )).toBe(false);
    expect(fences.size).toBe(0);
  });

  it("uses monotonic elapsed time so wall-clock jumps cannot reopen a fence", () => {
    const fences = new Map<string, number>();
    const elapsedNowMs = 1_000;
    recordCallTerminalFence(fences, CALL_ID, elapsedNowMs);
    const wallClock = vi.spyOn(Date, "now");

    wallClock.mockReturnValue(NOW + 3_600_000);
    expect(isCallTerminalFenced(fences, CALL_ID, elapsedNowMs + 1)).toBe(true);
    wallClock.mockReturnValue(NOW - 3_600_000);
    expect(isCallTerminalFenced(fences, CALL_ID, elapsedNowMs + 2)).toBe(true);
    expect(isCallTerminalFenced(
      fences,
      CALL_ID,
      elapsedNowMs + CALL_TERMINAL_FENCE_RETENTION_MS + 1,
    )).toBe(false);
    wallClock.mockRestore();
  });

  it("restores account-scoped fences and overflow across a process clock reset", () => {
    const fences = new Map<string, number>();
    for (let index = 0; index <= MAX_CALL_TERMINAL_FENCES; index += 1) {
      recordCallTerminalFence(fences, `call-${index}`, 1_000);
    }
    const serialized = serializeCallTerminalFences(fences, CALLEE_ID, 1_000, NOW);
    const restored = restoreCallTerminalFences(serialized, CALLEE_ID, 10, NOW + 1_000);

    expect(restored.valid).toBe(true);
    expect(restored.fences.size).toBe(MAX_CALL_TERMINAL_FENCE_STORAGE_ENTRIES);
    expect(isCallTerminalFenced(restored.fences, "unseen-call", 11)).toBe(true);
    expect(restoreCallTerminalFences(serialized, CALLER_ID, 10, NOW + 1_000).valid).toBe(false);
  });

  it("rejects terminal-fence payloads from a stale web auth epoch", () => {
    const fences = new Map<string, number>();
    recordCallTerminalFence(fences, CALL_ID, 1_000);
    const serialized = serializeCallTerminalFences(
      fences,
      CALLEE_ID,
      1_000,
      NOW,
      "session-epoch-a",
    );

    expect(restoreCallTerminalFences(
      serialized,
      CALLEE_ID,
      10,
      NOW + 1_000,
      "session-epoch-a",
    ).valid).toBe(true);
    expect(restoreCallTerminalFences(
      serialized,
      CALLEE_ID,
      10,
      NOW + 1_000,
      "session-epoch-b",
    ).valid).toBe(false);
  });

  it("restores safely after wall rollback and keeps forward time from rolling back", () => {
    const fences = new Map<string, number>();
    recordCallTerminalFence(fences, CALL_ID, 1_000);
    const serialized = serializeCallTerminalFences(fences, CALLEE_ID, 1_000, NOW);
    const rollbackRestore = restoreCallTerminalFences(
      serialized,
      CALLEE_ID,
      20,
      NOW - 3_600_000,
    );
    expect(rollbackRestore.wallClockFloorMs).toBe(NOW);
    expect(isCallTerminalFenced(rollbackRestore.fences, CALL_ID, 21)).toBe(true);

    const expiredRestore = restoreCallTerminalFences(
      serialized,
      CALLEE_ID,
      20,
      NOW + CALL_TERMINAL_FENCE_RETENTION_MS + 1,
    );
    expect(expiredRestore.fences.size).toBe(0);

    const clock = createRollbackSafeCallClock(NOW + 3_600_000, 20);
    expect(rollbackSafeCallWallNowMs(clock, NOW - 3_600_000, 21))
      .toBeGreaterThanOrEqual(NOW + 3_600_000);
  });

  it("discards corrupted persisted terminal-fence data", () => {
    expect(restoreCallTerminalFences("not-json", CALLEE_ID, 0, NOW)).toMatchObject({
      valid: false,
      fences: new Map(),
    });
    expect(restoreCallTerminalFences(JSON.stringify({
      version: 1,
      accountId: CALLEE_ID,
      entries: [{ callId: CALL_ID, recordedAtWallMs: NOW, retainUntilWallMs: NOW + 60_001 }],
      overflow: null,
    }), CALLEE_ID, 0, NOW).valid).toBe(false);
  });

  it("rejects malformed SDP discriminants and unbounded ICE", () => {
    expect(callSignalEventSchema.safeParse({
      ...eventBase(3, CALLER_ID, CALLEE_ID),
      type: "offer",
      sdp: { type: "answer", sdp: "v=0" },
    }).success).toBe(false);
    expect(callSignalEventSchema.safeParse({
      ...eventBase(4, CALLER_ID, CALLEE_ID),
      type: "ice",
      candidate: { candidate: "x".repeat(4_097) },
    }).success).toBe(false);
  });
});
