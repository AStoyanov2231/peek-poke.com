import { NextResponse } from "next/server";
import { withAuth, requireModeratorRole } from "@/lib/auth";

export const GET = withAuth(async (request, { user, supabase }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const status = request.nextUrl.searchParams.get("status") || "pending";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20));

  if (!["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: photos, error, count } = await supabase
    .from("profile_photos")
    .select(
      `*, user:profiles!user_id(id, username, display_name, avatar_url), reviewer:profiles!reviewed_by(id, username, display_name)`,
      { count: "exact" }
    )
    .eq("approval_status", status)
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("moderation/photos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    photos: photos ?? [],
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
