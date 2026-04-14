import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { dmThreadCreateSchema, parseBody } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export const GET = withAuth(async (_request, { user, supabase }) => {
  const { data, error } = await supabase.rpc("get_threads", { p_user_id: user.id });

  if (error) {
    console.error("dm/threads:", error);
    return apiError("Internal server error", 500, "THREADS_FETCH_FAILED");
  }

  return NextResponse.json(data);
});

export const POST = withAuth(async (request, { user, supabase }) => {
  const [body, err] = await parseBody(request, dmThreadCreateSchema);
  if (err) return err;

  const { data, error } = await supabase.rpc("create_or_find_thread", {
    p_user_a: user.id,
    p_user_b: body.user_id,
  });

  if (error) {
    console.error("dm/threads:", error);
    return apiError("Internal server error", 500, "THREADS_FETCH_FAILED");
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error },
      { status: data.status || 400 }
    );
  }

  return NextResponse.json(data);
});
