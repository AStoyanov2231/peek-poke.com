import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { dmMessageEditSchema, parseBody } from "@/lib/validators";
import { EDIT_WINDOW_MINUTES } from "@/lib/constants";

export const PATCH = withAuth<{ threadId: string; messageId: string }>(async (request, { user, supabase, params }) => {
  const { threadId, messageId } = params;

  if (!isValidUUID(threadId) || !isValidUUID(messageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify user is a participant in this thread
  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get the message to verify ownership and check edit window
  const { data: message, error: fetchError } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("id", messageId)
    .eq("thread_id", threadId)
    .single();

  if (fetchError || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.sender_id !== user.id) {
    return NextResponse.json({ error: "Cannot edit others' messages" }, { status: 403 });
  }

  if (message.is_deleted) {
    return NextResponse.json({ error: "Cannot edit deleted message" }, { status: 400 });
  }

  // Check 15-minute edit window
  const createdAt = new Date(message.created_at);
  const now = new Date();
  const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

  if (minutesSinceCreation > EDIT_WINDOW_MINUTES) {
    return NextResponse.json(
      { error: `Edit window expired (${EDIT_WINDOW_MINUTES} minutes)` },
      { status: 400 }
    );
  }

  const [body, err] = await parseBody(request, dmMessageEditSchema);
  if (err) return err;

  const { data, error } = await supabase
    .from("dm_messages")
    .update({
      content: body.content,
      is_edited: true,
    })
    .eq("id", messageId)
    .select("*, sender:profiles(*)")
    .single();

  if (error) {
    console.error("dm/[threadId]/[messageId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ message: data });
});

export const DELETE = withAuth<{ threadId: string; messageId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId, messageId } = params;

  if (!isValidUUID(threadId) || !isValidUUID(messageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify user is a participant in this thread
  if (!await verifyThreadParticipant(supabase, threadId, user.id)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get the message to verify ownership
  const { data: message, error: fetchError } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("id", messageId)
    .eq("thread_id", threadId)
    .single();

  if (fetchError || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.sender_id !== user.id) {
    return NextResponse.json({ error: "Cannot delete others' messages" }, { status: 403 });
  }

  if (message.is_deleted) {
    return NextResponse.json({ error: "Message already deleted" }, { status: 400 });
  }

  // Soft delete - set is_deleted to true
  const { data, error } = await supabase
    .from("dm_messages")
    .update({
      is_deleted: true,
      content: null, // Clear content on delete
    })
    .eq("id", messageId)
    .select("*, sender:profiles(*)")
    .single();

  if (error) {
    console.error("dm/[threadId]/[messageId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ message: data });
});
