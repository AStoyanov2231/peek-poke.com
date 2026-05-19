import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("get_threads", { p_user_id: auth.userId });

  if (error) {
    console.error("gpt/inbox:", error);
    return apiError("Failed to fetch inbox", 500, "INBOX_FETCH_FAILED");
  }

  return NextResponse.json({ threads: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const body = await request.json() as { user_id?: unknown };
  if (!body.user_id || typeof body.user_id !== "string" || !isValidUUID(body.user_id)) {
    return apiError("user_id must be a valid UUID", 400, "INVALID_USER_ID");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("create_or_find_thread", {
    p_user_a: auth.userId,
    p_user_b: body.user_id,
  });

  if (error) {
    console.error("gpt/inbox POST:", error);
    return apiError("Failed to create thread", 500, "THREAD_CREATE_FAILED");
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.status || 400 });
  }

  return NextResponse.json({ thread_id: data?.thread_id ?? data?.id ?? data });
}
