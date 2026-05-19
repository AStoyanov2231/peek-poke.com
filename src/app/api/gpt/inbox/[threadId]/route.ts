import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { sendPushToUser } from "@/lib/push/send";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const { threadId } = await params;
  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "INVALID_THREAD_ID");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("get_conversation", {
    p_thread_id: threadId,
    p_user_id: auth.userId,
  });

  if (error) {
    console.error("gpt/inbox/[threadId] GET:", error);
    return apiError("Failed to fetch messages", 500, "MESSAGES_FETCH_FAILED");
  }

  if (data?.error) {
    return apiError(data.error, 404, "THREAD_NOT_FOUND");
  }

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const { threadId } = await params;
  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "INVALID_THREAD_ID");
  }

  const body = await request.json() as { content?: unknown };
  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return apiError("content is required", 400, "CONTENT_REQUIRED");
  }
  const content = body.content.trim().slice(0, 2000);

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_thread_id: threadId,
    p_sender_id: auth.userId,
    p_content: content,
    p_message_type: "text",
    p_media_url: null,
  });

  if (error) {
    console.error("gpt/inbox/[threadId] POST:", error);
    return apiError("Failed to send message", 500, "MESSAGE_SEND_FAILED");
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.status || 403 });
  }

  void notifyRecipient(supabase, threadId, auth.userId, content);

  return NextResponse.json(data);
}

async function notifyRecipient(
  supabase: ReturnType<typeof createServiceClient>,
  threadId: string,
  senderId: string,
  content: string
) {
  try {
    const { data: thread } = await supabase
      .from("dm_threads")
      .select("participant_1_id, participant_2_id")
      .eq("id", threadId)
      .single();

    if (!thread) return;
    const recipientId =
      thread.participant_1_id === senderId ? thread.participant_2_id : thread.participant_1_id;

    const { data: sender } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", senderId)
      .single();

    await sendPushToUser(recipientId, {
      title: sender?.display_name || sender?.username || "New message",
      body: content.slice(0, 140),
      route: `/chat/${threadId}`,
      threadId,
      data: { kind: "dm", threadId, senderId },
    });
  } catch (err) {
    console.error("gpt notifyRecipient failed:", err);
  }
}
