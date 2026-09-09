import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { withNoStore } from "@/lib/no-store-response";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";
import { readDmConversationAccess } from "@/lib/dm-conversation-access";

export const GET = withNoStore(withAuth<{ threadId: string }>(async (_request, { user, params }) => {
  if (!isValidUUID(params.threadId)) return apiError("Conversation unavailable", 404, "THREAD_NOT_FOUND");
  const result = await readDmConversationAccess(params.threadId, user.id);
  return result.error ?? NextResponse.json(result.data);
}));
