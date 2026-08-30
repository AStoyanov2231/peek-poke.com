import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CALL_SIGNAL_EVENT,
  RING_SIGNAL_EVENT,
  callPeerInfoSchema,
  callSignalAckSchema,
  callSignalCommandFingerprint,
  callSignalCommandSchema,
  callSignalEventSchema,
  type CallSignalEvent,
} from "@peekpoke/shared";
import { withAuth, verifyThreadParticipant, isBlocked, isDeletedProfile } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import { broadcastPrivateRealtimeEvent } from "@/lib/realtime-broadcast";
import { createServiceClient } from "@/lib/supabase/server";

const callCommandResultSchema = z.strictObject({
  call_id: z.uuid(),
  thread_id: z.uuid(),
  capability: z.uuid(),
  sender_id: z.uuid(),
  recipient_id: z.uuid(),
  sequence: z.number().int().positive(),
  issued_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
  replayed: z.boolean(),
});

function commandHash(command: z.infer<typeof callSignalCommandSchema>) {
  return createHash("sha256")
    .update(callSignalCommandFingerprint(command))
    .digest("hex");
}

function callCommandError(code: string | undefined) {
  if (code === "PGRST202" || code === "42P01" || code === "42703") {
    return apiError("Call signaling is temporarily unavailable", 503, "CALL_SIGNAL_UNAVAILABLE");
  }
  if (code === "57014") return apiError("Call expired", 410, "CALL_EXPIRED");
  if (code === "42501") return apiError("Call is not allowed", 403, "CALL_FORBIDDEN");
  if (code === "23505" || code === "55000") {
    return apiError("Call state changed", 409, "CALL_SIGNAL_CONFLICT");
  }
  if (code === "22023") return apiError("Invalid call command", 400, "VALIDATION_ERROR");
  return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
}

function canonicalEvent(
  command: z.infer<typeof callSignalCommandSchema>,
  result: z.infer<typeof callCommandResultSchema>,
  fromUser?: z.infer<typeof callPeerInfoSchema>,
): CallSignalEvent {
  const base = {
    version: 1 as const,
    commandId: command.commandId,
    callId: result.call_id,
    threadId: result.thread_id,
    capability: result.capability,
    fromUserId: result.sender_id,
    toUserId: result.recipient_id,
    sequence: result.sequence,
    issuedAt: result.issued_at,
    expiresAt: result.expires_at,
  };
  switch (command.type) {
    case "invite":
      return callSignalEventSchema.parse({ ...base, type: command.type, fromUser });
    case "reject":
      return callSignalEventSchema.parse({ ...base, type: command.type, reason: command.reason });
    case "offer":
    case "answer":
      return callSignalEventSchema.parse({ ...base, type: command.type, sdp: command.sdp });
    case "ice":
      return callSignalEventSchema.parse({ ...base, type: command.type, candidate: command.candidate });
    case "cancel":
    case "recover-cancel":
    case "accept":
    case "end":
      return callSignalEventSchema.parse({
        ...base,
        type: command.type === "recover-cancel" ? "cancel" : command.type,
      });
    case "heartbeat":
      throw new Error("Heartbeat commands are acknowledgements only");
  }
}

export const POST = withAuth<{ threadId: string }>(
  async (request, { user, supabase, params }) => {
    const { threadId } = params;
    if (!isValidUUID(threadId) || threadId !== threadId.toLowerCase()) {
      return apiError("Invalid thread ID", 400, "VALIDATION_ERROR");
    }

    const thread = await verifyThreadParticipant(supabase, threadId, user.id);
    if (!thread) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");

    const [command, bodyError] = await parseBody(request, callSignalCommandSchema);
    if (bodyError) return bodyError;

    const limited = await enforceRateLimit(
      command.type === "invite" ? "callInvite" : "callSignal",
      user.id,
    );
    if (limited) return limited;

    const recipientId = thread.participant_1_id === user.id
      ? thread.participant_2_id
      : thread.participant_1_id;
    if (await isDeletedProfile(recipientId)) {
      return apiError("User not found", 410, "ACCOUNT_DELETED");
    }
    if (command.type === "invite" && await isBlocked(supabase, user.id, recipientId)) {
      return apiError("Blocked", 403, "BLOCKED");
    }
    if (command.type === "invite") {
      const recipientLimited = await enforceRateLimit("callInviteRecipient", recipientId);
      if (recipientLimited) return recipientLimited;
    }

    let fromUser: z.infer<typeof callPeerInfoSchema> | undefined;
    if (command.type === "invite") {
      const { data: senderProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", user.id)
        .single();
      if (profileError) return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
      const parsedProfile = callPeerInfoSchema.safeParse(senderProfile);
      if (!parsedProfile.success) {
        return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
      }
      fromUser = parsedProfile.data;
    }

    const service = createServiceClient();
    const payloadHash = commandHash(command);
    const rpcResult = command.type === "invite"
      ? await service.rpc("begin_call_session", {
          p_call_id: command.callId,
          p_thread_id: threadId,
          p_actor_id: user.id,
          p_command_id: command.commandId,
          p_payload_hash: payloadHash,
        })
      : command.type === "recover-cancel"
        ? await service.rpc("recover_cancel_call_session", {
            p_call_id: command.callId,
            p_thread_id: threadId,
            p_actor_id: user.id,
            p_command_id: command.commandId,
            p_invite_command_id: command.inviteCommandId,
            p_invite_payload_hash: commandHash({
              version: 1,
              type: "invite",
              commandId: command.inviteCommandId,
              callId: command.callId,
            }),
            p_payload_hash: payloadHash,
          })
      : await service.rpc("advance_call_session", {
          p_call_id: command.callId,
          p_thread_id: threadId,
          p_actor_id: user.id,
          p_capability: command.capability,
          p_command_id: command.commandId,
          p_event_type: command.type,
          p_payload_hash: payloadHash,
        });
    if (rpcResult.error) return callCommandError(rpcResult.error.code);

    const parsedResult = callCommandResultSchema.safeParse(rpcResult.data);
    if (!parsedResult.success
      || parsedResult.data.call_id !== command.callId
      || parsedResult.data.thread_id !== threadId
      || parsedResult.data.sender_id !== user.id
      || parsedResult.data.recipient_id !== recipientId) {
      return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
    }

    const acknowledgement = callSignalAckSchema.parse({
      version: 1,
      callId: parsedResult.data.call_id,
      threadId: parsedResult.data.thread_id,
      capability: parsedResult.data.capability,
      acceptedSequence: parsedResult.data.sequence,
      expiresAt: parsedResult.data.expires_at,
      replayed: parsedResult.data.replayed,
    });
    if (command.type === "heartbeat") {
      return NextResponse.json(acknowledgement);
    }

    const event = canonicalEvent(command, parsedResult.data, fromUser);
    if (command.type === "invite") {
      const { data: deliverable, error: deliveryError } = await service.rpc(
        "authorize_call_invite_delivery",
        {
          p_call_id: parsedResult.data.call_id,
          p_thread_id: parsedResult.data.thread_id,
          p_caller_id: parsedResult.data.sender_id,
          p_callee_id: parsedResult.data.recipient_id,
        },
      );
      if (deliveryError || (deliverable !== true && deliverable !== false)) {
        return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
      }
      // A replay after cancellation still returns its original acknowledgement,
      // but a terminal or newly-forbidden session must never ring again.
      if (!deliverable) return NextResponse.json(acknowledgement);
    }

    const terminalFanout = command.type === "cancel"
      || command.type === "recover-cancel"
      || command.type === "reject"
      || command.type === "end";
    const delivered = terminalFanout
      ? (await Promise.all([
          broadcastPrivateRealtimeEvent(
            `calls:user:${recipientId}`,
            RING_SIGNAL_EVENT,
            event,
          ),
          broadcastPrivateRealtimeEvent(
            `call:${threadId}`,
            CALL_SIGNAL_EVENT,
            event,
          ),
        ])).every(Boolean)
      : await broadcastPrivateRealtimeEvent(
          command.type === "invite" ? `calls:user:${recipientId}` : `call:${threadId}`,
          command.type === "invite" ? RING_SIGNAL_EVENT : CALL_SIGNAL_EVENT,
          event,
        );
    if (!delivered) {
      return apiError("Call signaling unavailable", 503, "CALL_SIGNAL_FAILED");
    }

    return NextResponse.json(acknowledgement);
  },
);
