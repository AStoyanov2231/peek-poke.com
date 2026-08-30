import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validators";
import type { SupabaseClient } from "@supabase/supabase-js";

const schema = z.object({
  token: z.string().min(16).max(4096),
  platform: z.enum(["ios", "android"]),
  provider: z.enum(["expo", "apns"]).optional().default("expo"),
}).superRefine((value, ctx) => {
  if (value.provider === "expo" && !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(value.token)) {
    ctx.addIssue({ code: "custom", path: ["token"], message: "Invalid Expo push token" });
  }
  if (value.provider === "apns" && !/^[a-fA-F0-9]{64}$/.test(value.token)) {
    ctx.addIssue({ code: "custom", path: ["token"], message: "Invalid APNs device token" });
  }
});

const deleteSchema = z.object({
  token: z.string().min(16).max(4096),
});

const verifiedSessionClaimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  iat: z.number().int().nonnegative(),
});

const MAX_BEARER_TOKEN_LENGTH = 8192;

function requestBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return undefined;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || match[1].length > MAX_BEARER_TOKEN_LENGTH) return null;
  return match[1];
}

async function verifiedSessionId(
  supabase: SupabaseClient,
  userId: string,
  request: Request,
) {
  const accessToken = requestBearerToken(request);
  if (accessToken === null) return null;

  const { data, error } = accessToken === undefined
    ? await supabase.auth.getClaims()
    : await supabase.auth.getClaims(accessToken);
  if (error) return null;
  const parsed = verifiedSessionClaimsSchema.safeParse(data?.claims);
  if (!parsed.success || parsed.data.sub !== userId) return null;
  return parsed.data.session_id;
}

function pushFenceUnavailable(error: { code?: string } | null) {
  return error?.code === "PGRST202"
    ? apiError("Push registration is temporarily unavailable", 503, "PUSH_SESSION_FENCE_UNAVAILABLE")
    : null;
}

export const POST = withAuth(async (request, { user, supabase: authClient }) => {
  const supabase = createServiceClient();
  const limited = await enforceRateLimit("pushToken", user.id);
  if (limited) return limited;

  const [parsed, bodyError] = await parseBody(request, schema);
  if (bodyError) return bodyError;
  const { token, platform, provider } = parsed;
  const sessionId = await verifiedSessionId(authClient, user.id, request);
  if (!sessionId) return apiError("Unauthorized", 401, "INVALID_AUTH_SESSION");

  const { error: updateError } = await supabase.rpc("upsert_push_device_v2", {
    p_user_id: user.id,
    p_token: token,
    p_platform: platform,
    p_provider: provider,
    p_session_id: sessionId,
  });

  if (updateError) {
    const unavailable = pushFenceUnavailable(updateError);
    if (unavailable) return unavailable;
    if (updateError.code === "22023") {
      return apiError("Unauthorized", 401, "INVALID_AUTH_SESSION");
    }
    return apiError("Internal server error", 500, "PUSH_TOKEN_UPDATE_FAILED");
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (request, { user, supabase: authClient }) => {
  const supabase = createServiceClient();
  const [parsed, bodyError] = await parseBody(request, deleteSchema);
  if (bodyError) return bodyError;
  const sessionId = await verifiedSessionId(authClient, user.id, request);
  if (!sessionId) return apiError("Unauthorized", 401, "INVALID_AUTH_SESSION");

  const { error: updateError } = await supabase.rpc("revoke_push_device_v2", {
    p_user_id: user.id,
    p_token: parsed.token,
    p_session_id: sessionId,
  });

  if (updateError) {
    const unavailable = pushFenceUnavailable(updateError);
    if (unavailable) return unavailable;
    if (updateError.code === "22023") {
      return apiError("Unauthorized", 401, "INVALID_AUTH_SESSION");
    }
    return apiError("Internal server error", 500, "PUSH_TOKEN_UPDATE_FAILED");
  }

  return NextResponse.json({ ok: true });
});
