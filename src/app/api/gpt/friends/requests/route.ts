import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("get_friend_requests", { p_user_id: auth.userId });

  if (error) {
    console.error("gpt/friends/requests:", error);
    return apiError("Failed to fetch requests", 500, "REQUESTS_FETCH_FAILED");
  }

  return NextResponse.json(data ?? { incoming: [], sent: [] });
}
