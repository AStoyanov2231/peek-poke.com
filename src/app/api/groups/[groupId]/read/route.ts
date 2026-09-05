import { NextResponse } from "next/server";
import { z } from "zod";
import { readReceiptResponseSchema } from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const groupReadRpcSchema = z.union([
  readReceiptResponseSchema,
  z.strictObject({ error: z.literal("GROUP_NOT_FOUND") }),
]);

export const POST = withAuth<{ groupId: string }>(async (_request, { user, params }) => {
  const { groupId } = params;
  if (!isValidUUID(groupId)) return apiError("Group not found", 404, "GROUP_NOT_FOUND");
  const limited = await enforceRateLimit("realtimeSignal", user.id);
  if (limited) return limited;

  const { data, error } = await createServiceClient().rpc("mark_shared_group_read", {
    p_group_id: groupId,
    p_user_id: user.id,
  });
  if (error) {
    console.error("groups/[groupId]/read: failed", error);
    return apiError("Unread status temporarily unavailable", 503, "GROUP_READ_FAILED");
  }
  const parsed = groupReadRpcSchema.safeParse(data);
  if (!parsed.success) {
    console.error("groups/[groupId]/read: malformed RPC result");
    return apiError("Unread status temporarily unavailable", 503, "GROUP_READ_FAILED");
  }
  if ("error" in parsed.data) return apiError("Group not found", 404, "GROUP_NOT_FOUND");
  return NextResponse.json(parsed.data);
});
