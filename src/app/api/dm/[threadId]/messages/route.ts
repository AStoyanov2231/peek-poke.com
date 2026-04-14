import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";

export const DELETE = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // TODO: Replace these two sequential operations with a clear_thread_messages() RPC
  // for atomic execution. Currently, if the thread update fails after messages are soft-deleted,
  // the thread preview will remain stale.
  // Soft-delete all messages in the thread
  const { error: deleteError } = await supabase
    .from("dm_messages")
    .update({ is_deleted: true })
    .eq("thread_id", threadId);

  if (deleteError) {
    console.error("dm/[threadId]/messages:", deleteError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Reset thread preview
  const { error: updateError } = await supabase
    .from("dm_threads")
    .update({
      last_message_at: null,
      last_message_preview: null,
    })
    .eq("id", threadId);

  if (updateError) {
    console.error("dm/[threadId]/messages:", updateError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
