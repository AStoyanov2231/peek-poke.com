import { withAuth, isBlocked, verifyThreadMembership } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withNoStore } from "@/lib/no-store-response";
import { contextualChatSuggestions } from "@/features/chat/server/suggestions";
import { NextResponse } from "next/server";

type Params = { threadId: string };
export const GET = withNoStore(withAuth<Params>(
  async (_request, { user, params, supabase }) => {
    if (!isValidUUID(params.threadId))
      return apiError("Invalid thread ID", 400, "VALIDATION_ERROR");
    const rate = await enforceRateLimit("chatSuggestions", user.id);
    if (rate) return rate;
    const thread = await verifyThreadMembership(params.threadId, user.id);
    if (!thread) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
    const peerId =
      thread.participant_1_id === user.id
        ? thread.participant_2_id
        : thread.participant_1_id;
    if (await isBlocked(supabase, user.id, peerId))
      return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
    try {
      const data = await contextualChatSuggestions(params.threadId, user.id, peerId);
      return NextResponse.json(data, {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      console.error("chat suggestions:", error);
      return apiError(
        "Suggestions are temporarily unavailable",
        503,
        "SUGGESTIONS_UNAVAILABLE",
      );
    }
  },
));
