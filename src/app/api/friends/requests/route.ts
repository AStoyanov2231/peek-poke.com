import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const [incomingResult, sentResult] = await Promise.all([
    supabase
      .from("friendships")
      .select("*, requester:profiles!requester_id(id, username, display_name, avatar_url, bio, location_text)")
      .eq("addressee_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("friendships")
      .select("*, addressee:profiles!addressee_id(id, username, display_name, avatar_url, bio, location_text)")
      .eq("requester_id", user.id)
      .eq("status", "pending"),
  ]);

  return NextResponse.json({
    requests: incomingResult.data || [],
    sentRequests: sentResult.data || [],
  });
});
