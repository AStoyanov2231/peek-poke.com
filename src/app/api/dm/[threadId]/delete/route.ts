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

  // TODO: Replace with delete_thread_and_messages() RPC for atomicity.
  // If message soft-delete succeeds but thread delete fails, messages are orphaned.
  // Soft-delete messages first
  const { error: msgError } = await supabase
    .from("dm_messages")
    .update({ is_deleted: true })
    .eq("thread_id", threadId);

  if (msgError) {
    console.error("dm/[threadId]/delete:", msgError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Hard-delete the thread
  const { error } = await supabase
    .from("dm_threads")
    .delete()
    .eq("id", threadId);

  if (error) {
    console.error("dm/[threadId]/delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
