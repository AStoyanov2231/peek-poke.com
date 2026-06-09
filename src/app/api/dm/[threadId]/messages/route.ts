import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export const DELETE = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("clear_thread_messages", {
    p_thread_id: threadId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("dm/[threadId]/messages:", error);
    return apiError("Internal server error", 500, "CLEAR_MESSAGES_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, data.status || 400, "CLEAR_MESSAGES_FAILED");
  }

  return NextResponse.json({ success: true });
});
