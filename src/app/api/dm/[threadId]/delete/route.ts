import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export const POST = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("delete_thread_and_messages", {
    p_thread_id: threadId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("dm/[threadId]/delete:", error);
    return apiError("Internal server error", 500, "DELETE_THREAD_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, data.status || 400, "DELETE_THREAD_FAILED");
  }

  return NextResponse.json({ success: true });
});
