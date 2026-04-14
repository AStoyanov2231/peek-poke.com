import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { friendshipUpdateSchema, parseBody } from "@/lib/validators";

export const PATCH = withAuth<{ friendshipId: string }>(async (request, { user, supabase, params }) => {
  const { friendshipId } = params;

  if (!isValidUUID(friendshipId)) {
    return NextResponse.json({ error: "Invalid friendship ID" }, { status: 400 });
  }

  const [body, err] = await parseBody(request, friendshipUpdateSchema);
  if (err) return err;

  const action = body.status === "accepted" ? "accepted" : "declined";

  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_friendship_id: friendshipId,
    p_user_id: user.id,
    p_action: action,
  });

  if (error) {
    console.error("friends/[friendshipId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error, message: data.message },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json(data);
});

export const DELETE = withAuth<{ friendshipId: string }>(async (_request, { user, supabase, params }) => {
  const { friendshipId } = params;

  if (!isValidUUID(friendshipId)) {
    return NextResponse.json({ error: "Invalid friendship ID" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("unfriend", {
    p_friendship_id: friendshipId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("friends/[friendshipId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json({
    success: data.success,
    refunded: data.refunded ?? false,
    balance: data.balance ?? null,
  });
});
