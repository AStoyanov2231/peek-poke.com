import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_PAGE_SIZE,
  sharedGroupJoinRequestSchema,
  sharedGroupJoinResponseSchema,
  sharedGroupSummarySchema,
  sharedGroupsResponseSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { cursorPage } from "@/lib/api-contract";
import { parseBody } from "@/lib/validators";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

const sharedGroupListRpcSchema = z.array(sharedGroupSummarySchema).max(MAX_PAGE_SIZE + 1);

export const GET = withAuth(async (request, { user }) => {
  const service = createServiceClient();
  const { data, error } = await service.rpc("get_shared_groups", { p_user_id: user.id });
  if (error) {
    console.error("groups: list failed", error);
    return apiError("Shared groups are temporarily unavailable", 503, "GROUPS_FETCH_FAILED");
  }

  const parsed = sharedGroupListRpcSchema.safeParse(data);
  if (!parsed.success) {
    console.error("groups: malformed list response");
    return apiError("Shared groups are temporarily unavailable", 503, "GROUPS_FETCH_FAILED");
  }

  const page = cursorPage(
    request,
    parsed.data,
    (group) => group.id,
    (group) => group.last_message_at ?? group.created_at,
  );
  if (page.error) return page.error;
  const response = sharedGroupsResponseSchema.safeParse({
    groups: page.data.items,
    total_unread: page.data.items.reduce((total, group) => total + group.unread_count, 0),
    pagination: page.data.page,
  });
  if (!response.success) {
    console.error("groups: malformed public list response");
    return apiError("Shared groups are temporarily unavailable", 503, "GROUPS_FETCH_FAILED");
  }
  return NextResponse.json(response.data);
});

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("groupJoin", user.id);
  if (limited) return limited;
  const [body, parseError] = await parseBody(request, sharedGroupJoinRequestSchema);
  if (parseError) return parseError;

  const { data, error } = await createServiceClient().rpc("create_or_join_shared_group", {
    p_user_id: user.id,
    p_qr_content: body.qr_content,
  });
  if (error) {
    console.error("groups: join failed", error);
    return apiError("Could not join this shared group", 503, "GROUP_JOIN_FAILED");
  }
  const response = sharedGroupJoinResponseSchema.safeParse(data);
  if (!response.success) {
    console.error("groups: malformed join response");
    return apiError("Could not join this shared group", 503, "GROUP_JOIN_FAILED");
  }
  return NextResponse.json(response.data);
});
