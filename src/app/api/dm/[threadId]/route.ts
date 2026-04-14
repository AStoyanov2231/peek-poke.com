import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { dmMessageSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

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

  return NextResponse.json(data);
});
