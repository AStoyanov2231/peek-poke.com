import { NextResponse } from "next/server";
import { withAuth, verifyThreadParticipant } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { dmMessageSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";
import { sendPushToUser } from "@/lib/push/send";

export const GET = withAuth<{ threadId: string }>(async (_request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "THREAD_NOT_FOUND");
  }

  const { data, error } = await supabase.rpc("get_conversation", {
    p_thread_id: threadId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("dm/[threadId]:", error);
    return apiError("Internal server error", 500, "THREAD_NOT_FOUND");
  }

  if (data?.error) {
    return apiError(data.error, 404, "THREAD_NOT_FOUND");
  }

  return NextResponse.json(data);
});

export const POST = withAuth<{ threadId: string }>(async (request, { user, supabase, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "THREAD_NOT_FOUND");
  }

  const [msg, err] = await parseBody(request, dmMessageSchema);
  if (err) return err;

  const { data, error } = await supabase.rpc("send_message", {
    p_thread_id: threadId,
    p_sender_id: user.id,
    p_content: msg.content,
    p_message_type: msg.message_type,
    p_media_url: msg.media_url || null,
  });

  if (error) {
    console.error("dm/[threadId]:", error);
    return apiError("Internal server error", 500, "MESSAGE_SEND_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, 403, "MESSAGE_SEND_FAILED");
  }

  // Notify the other participant. Best-effort — failures must not break the send.
  void notifyRecipient({
    supabase,
    threadId,
    senderId: user.id,
    content: msg.content,
    messageType: msg.message_type,
  });

  return NextResponse.json(data);
});

async function notifyRecipient(args: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  threadId: string;
  senderId: string;
  content: string;
  messageType: string;
}) {
  try {
    const thread = await verifyThreadParticipant(args.supabase, args.threadId, args.senderId);
    if (!thread) return;
    const recipientId =
      thread.participant_1_id === args.senderId ? thread.participant_2_id : thread.participant_1_id;

    const { data: sender } = await args.supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", args.senderId)
      .single();

    const title = sender?.display_name || sender?.username || "New message";
    const body =
      args.messageType === "text"
        ? args.content.slice(0, 140)
        : `Sent ${args.messageType === "image" ? "a photo" : "a message"}`;

    await sendPushToUser(recipientId, {
      title,
      body,
      route: `/chat/${args.threadId}`,
      threadId: args.threadId,
      data: { kind: "dm", threadId: args.threadId, senderId: args.senderId },
    });
  } catch (err) {
    console.error("notifyRecipient failed:", err);
  }
}
