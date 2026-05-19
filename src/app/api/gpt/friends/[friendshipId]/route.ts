import { NextRequest, NextResponse } from "next/server";
import { withGptAuth, isGptAuthError } from "@/lib/gpt-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ friendshipId: string }> }
) {
  const auth = await withGptAuth(request);
  if (isGptAuthError(auth)) return auth;

  const { friendshipId } = await params;
  if (!isValidUUID(friendshipId)) {
    return apiError("Invalid friendship ID", 400, "INVALID_ID");
  }

  const body = await request.json() as { status?: unknown };
  if (body.status !== "accepted" && body.status !== "declined") {
    return apiError("status must be 'accepted' or 'declined'", 400, "INVALID_STATUS");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_friendship_id: friendshipId,
    p_user_id: auth.userId,
    p_status: body.status,
  });

  if (error) {
    console.error("gpt/friends/[friendshipId]:", error);
    return apiError("Failed to respond to request", 500, "RESPOND_FAILED");
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.status || 400 });
  }

  return NextResponse.json(data);
}
