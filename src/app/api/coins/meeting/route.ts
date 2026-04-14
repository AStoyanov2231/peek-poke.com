import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export const POST = withAuth(async (request, { user, supabase }) => {
  const body = await request.json();
  const friendId = body.friend_id;

  if (!friendId || typeof friendId !== "string") {
    return apiError("friend_id is required", 400, "MEETING_RECORD_FAILED");
  }
  if (!isValidUUID(friendId)) {
    return apiError("Invalid friend_id", 400, "MEETING_RECORD_FAILED");
  }

  const { data, error } = await supabase.rpc("record_meeting", {
    p_user_a: user.id,
    p_user_b: friendId,
  });

  if (error) {
    console.error("coins/meeting:", error);
    return apiError("Internal server error", 500, "MEETING_RECORD_FAILED");
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error, message: data.message },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json({
    success: data.success,
    awarded: data.awarded ?? false,
    already_met: data.already_met ?? false,
    balance: data.balance_a ?? null,
  });
});
