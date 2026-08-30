import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callSignalAckSchema, callSignalCommandFingerprint } from "@peekpoke/shared";

const USER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const CAPABILITY = "55555555-5555-4555-8555-555555555555";
const COMMAND = "66666666-6666-4666-8666-666666666666";
const INVITE_COMMAND = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  broadcast: vi.fn(),
  rateLimit: vi.fn(),
  profileSingle: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) => handler(request, {
      user: { id: USER },
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ single: mocks.profileSingle }),
          }),
        }),
      },
      params: { threadId: THREAD },
    }),
  verifyThreadParticipant: vi.fn(async () => ({
    id: THREAD,
    participant_1_id: USER,
    participant_2_id: PEER,
  })),
  isBlocked: vi.fn(async () => false),
  isDeletedProfile: vi.fn(async () => false),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastPrivateRealtimeEvent: mocks.broadcast,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "@/app/api/dm/[threadId]/call/route";

function request(body: unknown) {
  return POST(new Request(`https://example.test/api/dm/${THREAD}/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), {} as never);
}

function rpcResult(overrides: Record<string, unknown> = {}) {
  return {
    call_id: CALL,
    thread_id: THREAD,
    capability: CAPABILITY,
    sender_id: USER,
    recipient_id: PEER,
    sequence: 1,
    issued_at: "2026-08-08T12:00:00.000+00:00",
    expires_at: "2026-08-08T12:00:30.000+00:00",
    replayed: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("POST /api/dm/[threadId]/call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.broadcast.mockResolvedValue(true);
    mocks.profileSingle.mockResolvedValue({
      data: { id: USER, display_name: "Alice", username: "alice", avatar_url: null },
      error: null,
    });
    mocks.rpc.mockImplementation(async (name: string) => name === "authorize_call_invite_delivery"
      ? { data: true, error: null }
      : { data: rpcResult(), error: null });
  });

  it("derives ownership server-side, commits the strict invite, and broadcasts the canonical event", async () => {
    const command = { version: 1 as const, type: "invite" as const, commandId: COMMAND, callId: CALL };
    const response = await request(command);
    const payload = await response.json();
    const hash = createHash("sha256").update(callSignalCommandFingerprint(command)).digest("hex");

    expect(response.status).toBe(200);
    expect(callSignalAckSchema.parse(payload)).toEqual(payload);
    expect(mocks.rateLimit.mock.calls).toEqual([
      ["callInvite", USER],
      ["callInviteRecipient", PEER],
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("begin_call_session", {
      p_call_id: CALL,
      p_thread_id: THREAD,
      p_actor_id: USER,
      p_command_id: COMMAND,
      p_payload_hash: hash,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("authorize_call_invite_delivery", {
      p_call_id: CALL,
      p_thread_id: THREAD,
      p_caller_id: USER,
      p_callee_id: PEER,
    });
    const authorizationCall = mocks.rpc.mock.invocationCallOrder[1];
    const broadcastCall = mocks.broadcast.mock.invocationCallOrder[0];
    expect(authorizationCall).toBeLessThan(broadcastCall!);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `calls:user:${PEER}`,
      "ring-invite",
      expect.objectContaining({
        type: "invite",
        callId: CALL,
        fromUserId: USER,
        toUserId: PEER,
        capability: CAPABILITY,
      }),
    );
  });

  it("enforces the recipient invite rate bound before committing or broadcasting", async () => {
    mocks.rateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 429 }));

    const response = await request({
      version: 1,
      type: "invite",
      commandId: COMMAND,
      callId: CALL,
    });

    expect(response.status).toBe(429);
    expect(mocks.rateLimit.mock.calls).toEqual([
      ["callInvite", USER],
      ["callInviteRecipient", PEER],
    ]);
    expect(mocks.profileSingle).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("fans terminal end state through both member and ring topics", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 2 }), error: null });
    const command = {
      version: 1 as const,
      type: "end" as const,
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    };
    const response = await request(command);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("advance_call_session", expect.objectContaining({
      p_actor_id: USER,
      p_event_type: "end",
      p_capability: CAPABILITY,
    }));
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `calls:user:${PEER}`,
      "ring-invite",
      expect.objectContaining({ type: "end", sequence: 2 }),
    );
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `call:${THREAD}`,
      "call-signal",
      expect.objectContaining({ type: "end", sequence: 2 }),
    );
  });

  it("keeps nonterminal state changes on the member topic", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 2 }), error: null });
    const response = await request({
      version: 1,
      type: "accept",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    });

    expect(response.status).toBe(200);
    expect(mocks.broadcast).toHaveBeenCalledOnce();
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `call:${THREAD}`,
      "call-signal",
      expect.objectContaining({ type: "accept", sequence: 2 }),
    );
  });

  it("fans a committed decline through both topics before acknowledging", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 2 }), error: null });
    const response = await request({
      version: 1,
      type: "reject",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
      reason: "declined",
    });

    expect(response.status).toBe(200);
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `calls:user:${PEER}`,
      "ring-invite",
      expect.objectContaining({ type: "reject", reason: "declined", sequence: 2 }),
    );
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `call:${THREAD}`,
      "call-signal",
      expect.objectContaining({ type: "reject", reason: "declined", sequence: 2 }),
    );
  });

  it("re-fans an exact terminal replay with its durable identity", async () => {
    mocks.rpc.mockResolvedValue({
      data: rpcResult({ sequence: 4, replayed: true }),
      error: null,
    });
    const command = {
      version: 1 as const,
      type: "end" as const,
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    };
    const response = await request(command);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      callId: CALL,
      acceptedSequence: 4,
      replayed: true,
    });
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    for (const broadcast of mocks.broadcast.mock.calls) {
      expect(broadcast[2]).toMatchObject({
        type: "end",
        commandId: COMMAND,
        callId: CALL,
        sequence: 4,
      });
    }
  });

  it("does not broadcast a reject that the accepted-session transition fence refuses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000" } });
    const response = await request({
      version: 1,
      type: "reject",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
      reason: "busy",
    });

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith("advance_call_session", expect.objectContaining({
      p_actor_id: USER,
      p_call_id: CALL,
      p_thread_id: THREAD,
      p_capability: CAPABILITY,
      p_event_type: "reject",
    }));
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("fans cancellation out to both a ringing invite and an already accepted call", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 2 }), error: null });
    const response = await request({
      version: 1,
      type: "cancel",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    });

    expect(response.status).toBe(200);
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `calls:user:${PEER}`,
      "ring-invite",
      expect.objectContaining({ type: "cancel", sequence: 2 }),
    );
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `call:${THREAD}`,
      "call-signal",
      expect.objectContaining({ type: "cancel", sequence: 2 }),
    );
  });

  it("recovers a committed invite without a client capability and broadcasts canonical cancellation", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 2 }), error: null });
    const command = {
      version: 1 as const,
      type: "recover-cancel" as const,
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: INVITE_COMMAND,
    };
    const invite = {
      version: 1 as const,
      type: "invite" as const,
      commandId: INVITE_COMMAND,
      callId: CALL,
    };
    const response = await request(command);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("recover_cancel_call_session", {
      p_call_id: CALL,
      p_thread_id: THREAD,
      p_actor_id: USER,
      p_command_id: COMMAND,
      p_invite_command_id: INVITE_COMMAND,
      p_invite_payload_hash: createHash("sha256")
        .update(callSignalCommandFingerprint(invite)).digest("hex"),
      p_payload_hash: createHash("sha256")
        .update(callSignalCommandFingerprint(command)).digest("hex"),
    });
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `calls:user:${PEER}`,
      "ring-invite",
      expect.objectContaining({ type: "cancel", commandId: COMMAND, sequence: 2 }),
    );
    expect(mocks.broadcast).toHaveBeenCalledWith(
      `call:${THREAD}`,
      "call-signal",
      expect.objectContaining({ type: "cancel", commandId: COMMAND, sequence: 2 }),
    );
    for (const broadcast of mocks.broadcast.mock.calls) {
      expect(broadcast[2]).not.toHaveProperty("inviteCommandId");
    }
  });

  it("renews a connected session without broadcasting a peer event", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ sequence: 8 }), error: null });
    const response = await request({
      version: 1,
      type: "heartbeat",
      commandId: COMMAND,
      callId: CALL,
      capability: CAPABILITY,
    });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("advance_call_session", expect.objectContaining({
      p_event_type: "heartbeat",
    }));
    expect(mocks.broadcast).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ acceptedSequence: 8 });
  });

  it("suppresses an invite when recovery cancellation commits before the invite RPC returns", async () => {
    const committedInvite = deferred<{ data: ReturnType<typeof rpcResult>; error: null }>();
    let cancelled = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "begin_call_session") return committedInvite.promise;
      if (name === "recover_cancel_call_session") {
        cancelled = true;
        return { data: rpcResult({ sequence: 2 }), error: null };
      }
      if (name === "authorize_call_invite_delivery") {
        return { data: !cancelled, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const inviteRequest = request({
      version: 1,
      type: "invite",
      commandId: INVITE_COMMAND,
      callId: CALL,
    });
    await vi.waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("begin_call_session", expect.any(Object));
    });

    const cancelResponse = await request({
      version: 1,
      type: "recover-cancel",
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: INVITE_COMMAND,
    });
    expect(cancelResponse.status).toBe(200);
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);

    committedInvite.resolve({ data: rpcResult(), error: null });
    const inviteResponse = await inviteRequest;
    expect(inviteResponse.status).toBe(200);
    await expect(inviteResponse.json()).resolves.toMatchObject({
      callId: CALL,
      acceptedSequence: 1,
      replayed: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("authorize_call_invite_delivery", {
      p_call_id: CALL,
      p_thread_id: THREAD,
      p_caller_id: USER,
      p_callee_id: PEER,
    });
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    for (const broadcast of mocks.broadcast.mock.calls) {
      expect(broadcast[2]).toMatchObject({ type: "cancel", sequence: 2 });
    }
  });

  it("returns the exact durable invite acknowledgement without rebroadcast after cancellation", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "begin_call_session") {
        return { data: rpcResult({ replayed: true }), error: null };
      }
      if (name === "authorize_call_invite_delivery") {
        return { data: false, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const response = await request({
      version: 1,
      type: "invite",
      commandId: INVITE_COMMAND,
      callId: CALL,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      acceptedSequence: 1,
      expiresAt: "2026-08-08T12:00:30.000+00:00",
      replayed: true,
    });
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it.each([
    ["errors", { data: null, error: { code: "XX000" } }],
    ["returns a malformed result", { data: null, error: null }],
  ])("fails closed when final invite authorization %s", async (_label, authorization) => {
    mocks.rpc.mockImplementation(async (name: string) => name === "begin_call_session"
      ? { data: rpcResult(), error: null }
      : authorization);

    const response = await request({
      version: 1,
      type: "invite",
      commandId: INVITE_COMMAND,
      callId: CALL,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "CALL_SIGNAL_FAILED" });
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("retries a failed invite delivery with the same command without changing durable identity", async () => {
    let beginCalls = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "begin_call_session") {
        beginCalls += 1;
        return { data: rpcResult({ replayed: beginCalls > 1 }), error: null };
      }
      if (name === "authorize_call_invite_delivery") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.broadcast.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const command = {
      version: 1 as const,
      type: "invite" as const,
      commandId: INVITE_COMMAND,
      callId: CALL,
    };

    const failed = await request(command);
    expect(failed.status).toBe(503);
    const retried = await request(command);
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toMatchObject({
      callId: CALL,
      threadId: THREAD,
      capability: CAPABILITY,
      acceptedSequence: 1,
      expiresAt: "2026-08-08T12:00:30.000+00:00",
      replayed: true,
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "begin_call_session")).toHaveLength(2);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "authorize_call_invite_delivery"))
      .toHaveLength(2);
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["legacy action", { action: "invite", callId: CALL }],
    ["injected recipient", { version: 1, type: "invite", commandId: COMMAND, callId: CALL, recipientId: PEER }],
    ["missing capability", { version: 1, type: "end", commandId: COMMAND, callId: CALL }],
    ["forged recovery capability", {
      version: 1, type: "recover-cancel", commandId: COMMAND, callId: CALL,
      inviteCommandId: INVITE_COMMAND, capability: CAPABILITY,
    }],
    ["recovery without invite identity", {
      version: 1, type: "recover-cancel", commandId: COMMAND, callId: CALL,
    }],
  ])("rejects %s before rate limit, RPC, or broadcast", async (_label, body) => {
    const response = await request(body);
    expect(response.status).toBe(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("fails closed on malformed RPC identity instead of broadcasting", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcResult({ recipient_id: USER }), error: null });
    const response = await request({ version: 1, type: "invite", commandId: COMMAND, callId: CALL });

    expect(response.status).toBe(503);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("maps durable transition conflicts and broadcast delivery failures", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "55000" } });
    const conflict = await request({ version: 1, type: "invite", commandId: COMMAND, callId: CALL });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "CALL_SIGNAL_CONFLICT" });

    mocks.rpc.mockResolvedValueOnce({ data: rpcResult(), error: null });
    mocks.broadcast.mockResolvedValueOnce(false);
    const unavailable = await request({ version: 1, type: "invite", commandId: COMMAND, callId: CALL });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ code: "CALL_SIGNAL_FAILED" });
  });

  it("fails closed on forged recovery ownership and either cancellation delivery leg", async () => {
    const recovery = {
      version: 1,
      type: "recover-cancel",
      commandId: COMMAND,
      callId: CALL,
      inviteCommandId: INVITE_COMMAND,
    };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const forbidden = await request(recovery);
    expect(forbidden.status).toBe(403);
    expect(mocks.broadcast).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: rpcResult({ sequence: 2 }), error: null });
    mocks.broadcast.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const incomplete = await request(recovery);
    expect(incomplete.status).toBe(503);
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
  });
});
