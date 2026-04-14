import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async (request, { user, supabase }) => {
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20));

  if (!["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_moderation_queue", {
    p_moderator_id: user.id,
    p_status: status,
    p_page: page,
    p_limit: limit,
  });

  if (error) {
    console.error("moderation/photos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.status || 403 });
  }

  return NextResponse.json(data);
});
