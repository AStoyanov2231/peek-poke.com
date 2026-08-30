import { NextResponse } from "next/server";
import { z } from "zod";
import { readReceiptResponseSchema } from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

const readReceiptRpcResultSchema = z.union([
  readReceiptResponseSchema,
  z.strictObject({ error: z.literal("THREAD_NOT_FOUND") }),
]);

export const POST = withAuth<{ threadId: string }>(async (_request, { user, params }) => {
  const { threadId } = params;

  if (!isValidUUID(threadId)) {
    return apiError("Invalid thread ID", 400, "INVALID_THREAD_ID");
  }

  const limited = await enforceRateLimit("realtimeSignal", user.id);
  if (limited) return limited;

  const service = createServiceClient();
  const { data, error } = await service.rpc("mark_thread_read_sequence", {
    p_thread_id: threadId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("dm/[threadId]/read:", error);
    return apiError("Internal server error", 500, "MESSAGE_READ_FAILED");
  }
  const parsed = readReceiptRpcResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("dm/[threadId]/read: malformed RPC result", parsed.error);
    return apiError("Internal server error", 500, "MESSAGE_READ_FAILED");
  }
  if ("error" in parsed.data) {
    return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  }

  return NextResponse.json(readReceiptResponseSchema.parse(parsed.data));
});
