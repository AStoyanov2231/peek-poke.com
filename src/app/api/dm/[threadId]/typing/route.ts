import { NextResponse } from "next/server";
import { isBlocked, isDeletedProfile, withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { broadcastPrivateRealtimeEvent } from "@/lib/realtime-broadcast";
import { apiError } from "@/lib/api-error";

export const POST = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "INVALID_THREAD_ID");
  }

  const limited = await enforceRateLimit("realtimeSignal", user.id);
  if (limited) return limited;

  const thread = await verifyThreadParticipant(supabase, threadId, user.id);
  if (!thread) {
    return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  }

  const peerId = thread.participant_1_id === user.id
    ? thread.participant_2_id
    : thread.participant_1_id;
  if (await isDeletedProfile(peerId)) {
    return apiError("Thread is read-only", 410, "THREAD_READ_ONLY");
  }
  if (await isBlocked(supabase, user.id, peerId)) {
    return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  }

  const delivered = await broadcastPrivateRealtimeEvent(
    `thread:${threadId}`,
    "typing",
    {
      userId: user.id,
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    }
  );
  if (!delivered) {
    return apiError("Typing signal unavailable", 503, "TYPING_UNAVAILABLE");
  }

  return NextResponse.json({ success: true });
});
