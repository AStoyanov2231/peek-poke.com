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

export const DELETE = withAuth<{ userId: string }>(async (_request, { user, supabase, params }) => {
  const { userId } = params;

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("unblock_user", {
    p_blocker_id: user.id,
    p_blocked_id: userId,
  });

  if (error) {
    console.error("users/[userId]/block:", error);
    return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.status || 400 });
  }

  return NextResponse.json({ success: true });
});
