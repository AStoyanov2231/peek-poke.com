import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { friendRequestSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase.rpc("get_friends", { p_user_id: user.id });

  if (error) {
    console.error("friends:", error);
    return apiError("Internal server error", 500, "FRIENDS_FETCH_FAILED");
  }

  return NextResponse.json(data);
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const [body, err] = await parseBody(request, friendRequestSchema);
  if (err) return err;

  const { data, error } = await supabase.rpc("send_friend_request", {
    p_requester_id: user.id,
    p_addressee_id: body.addressee_id,
  });

  if (error) {
    console.error("friends:", error);
    return apiError("Internal server error", 500, "FRIEND_REQUEST_FAILED");
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error, message: data.message },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json(data);
});
