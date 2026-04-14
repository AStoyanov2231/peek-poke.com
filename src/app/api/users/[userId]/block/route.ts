import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";

export const POST = withAuth<{ userId: string }>(async (_request, { user, supabase, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("block_user", {
    p_blocker_id: user.id,
    p_blocked_id: userId,
  });

  if (error) {
    console.error("users/[userId]/block:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json(data);
});

// TODO: Create unblock_user() RPC to properly reverse all side effects of block_user() RPC.
// This direct table delete may not undo all effects (e.g., removed friendships from block).
export const DELETE = withAuth<{ userId: string }>(async (_request, { user, supabase, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
