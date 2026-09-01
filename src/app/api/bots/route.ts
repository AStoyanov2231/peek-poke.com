import { NextResponse } from "next/server";
import {
  adminBotCollectResultSchema,
} from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { coinBotCollectSchema, parseBody } from "@/lib/validators";
import { createServiceClient } from "@/lib/supabase/server";
import {
  adminBotListQuerySchema,
  adminBotListResponseSchema,
  normalizeAdminBotListQuery,
} from "@peekpoke/shared";

export const GET = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("coinBot", user.id);
  if (limited) return limited;

  const query = adminBotListQuerySchema.safeParse(
    normalizeAdminBotListQuery(new URL(request.url).searchParams),
  );
  if (!query.success) return apiError("Invalid bot location", 400, "VALIDATION_ERROR");

  const { data, error } = await createServiceClient().rpc("list_admin_coins_for_user", {
    p_user_id: user.id,
  });
  if (error) {
    console.error("bots/GET:", error);
    return apiError("Bot discovery is temporarily unavailable", 503, "BOT_LIST_UNAVAILABLE");
  }
  const result = adminBotListResponseSchema.safeParse(data ?? []);
  if (!result.success) {
    console.error("bots/GET: invalid response");
    return apiError("Bot discovery is temporarily unavailable", 503, "BOT_LIST_UNAVAILABLE");
  }
  return NextResponse.json(result.data);
});

export const POST = withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("coinBot", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(request, coinBotCollectSchema);
  if (bodyError) return bodyError;

  const { data, error } = await createServiceClient().rpc("collect_admin_coin_for_user", {
    p_user_id: user.id,
    p_coin_id: body.id,
  });
  if (error) {
    console.error("bots/POST:", error);
    return apiError("Internal server error", 500, "BOT_COLLECT_FAILED");
  }
  const result = adminBotCollectResultSchema.safeParse(data);
  if (!result.success) {
    console.error("bots/POST: invalid response");
    return apiError("Internal server error", 500, "BOT_COLLECT_FAILED");
  }
  return NextResponse.json(result.data);
});
