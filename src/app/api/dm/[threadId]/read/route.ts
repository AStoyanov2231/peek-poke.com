import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";

export const POST = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Mark all unread messages in this thread as read (messages not sent by current user)
  const { error } = await supabase
    .from("dm_messages")
    .update({ is_read: true })
    .eq("thread_id", threadId)
    .neq("sender_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("dm/[threadId]/read:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
