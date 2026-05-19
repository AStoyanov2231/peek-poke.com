import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const supabase = createServiceClient();

  const [profileResult, coinsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, location_text, is_online, last_seen_at")
      .eq("id", auth.userId)
      .single(),
    supabase
      .from("user_coins")
      .select("balance")
      .eq("user_id", auth.userId)
      .single(),
  ]);

  if (profileResult.error) {
    console.error("gpt/me:", profileResult.error);
    return apiError("Failed to fetch profile", 500, "PROFILE_FETCH_FAILED");
  }

  return NextResponse.json({
    profile: profileResult.data,
    coins: coinsResult.data?.balance ?? 0,
  });
}
