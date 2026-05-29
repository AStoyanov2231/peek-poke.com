import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant, isBlocked } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { sendPushToUser } from "@/lib/push/send";

const ALLOWED_ACTIONS = ["invite", "cancel", "reject"] as const;
type CallAction = (typeof ALLOWED_ACTIONS)[number];

/** POST /api/dm/[threadId]/call  { action, callId } */
export const POST = withAuth<{ threadId: string }>(
  async (request, { user, supabase, params }) => {
    const { threadId } = params;

    if (!isValidUUID(threadId)) {
      return apiError("Invalid thread ID", 400, "VALIDATION_ERROR");
    }

    const thread = await verifyThreadParticipant(supabase, threadId, user.id);
    if (!thread) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");

    let body: { action?: string; callId?: string };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400, "VALIDATION_ERROR");
    }

    const { action, callId } = body;

    if (!action || !ALLOWED_ACTIONS.includes(action as CallAction)) {
      return apiError("Invalid action", 400, "VALIDATION_ERROR");
    }
    if (!callId || !isValidUUID(callId)) {
      return apiError("Invalid call ID", 400, "VALIDATION_ERROR");
    }

    const recipientId =
      thread.participant_1_id === user.id
        ? thread.participant_2_id
        : thread.participant_1_id;

    // Block check — only for invite
    if (action === "invite") {
      const blocked = await isBlocked(supabase, user.id, recipientId);
      if (blocked) return apiError("Blocked", 403, "BLOCKED");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    async function broadcast(topic: string, event: string, payload: unknown) {
      const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ messages: [{ topic, event, payload }] }),
      });
      if (!res.ok) {
        console.error(`Broadcast to ${topic} failed: ${res.status}`);
      }
    }

    if (action === "invite") {
      // Fetch sender profile for ring payload and push title
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", user.id)
        .single();

      const fromUser = senderProfile ?? {
        id: user.id,
        display_name: null,
        username: "Unknown",
        avatar_url: null,
      };

      // Broadcast invite to recipient's personal ring channel
      await broadcast(`calls:user:${recipientId}`, "ring-invite", {
        type: "invite",
        callId,
        threadId,
        fromUser,
      });

      // Push notification — best-effort
      const callerName =
        senderProfile?.display_name || senderProfile?.username || "Someone";
      void sendPushToUser(recipientId, {
        title: "📹 Incoming video call",
        body: `${callerName} is calling you`,
        route: `/chat/${threadId}`,
        threadId,
        data: { kind: "call", threadId, callId, fromUserId: user.id },
      });
    } else if (action === "cancel") {
      // Caller cancelled before callee answered
      await broadcast(`calls:user:${recipientId}`, "ring-invite", {
        type: "cancel",
        callId,
      });
    } else if (action === "reject") {
      // Callee explicitly declined — signal caller on the call channel
      await broadcast(`call:${threadId}`, "call-signal", {
        type: "reject",
        callId,
        reason: "declined",
      });
    }

    return NextResponse.json({ success: true });
  }
);
