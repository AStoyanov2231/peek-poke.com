import { NextResponse } from "next/server";
import { withAuth, requireModeratorRole } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { moderationActionSchema, parseBody } from "@/lib/validators";

export const PATCH = withAuth<{ photoId: string }>(async (request, { user, supabase, params }) => {
  const forbidden = await requireModeratorRole(supabase, user.id);
  if (forbidden) return forbidden;

  const { photoId } = params;

  if (!isValidUUID(photoId)) {
    return NextResponse.json({ error: "Invalid photo ID" }, { status: 400 });
  }

  const [body, err] = await parseBody(request, moderationActionSchema);
  if (err) return err;

  const { action, reason } = body;

  // Update photo
  const updateData: {
    approval_status: string;
    reviewed_by: string;
    reviewed_at: string;
    rejection_reason: string | null;
  } = {
    approval_status: action === "approve" ? "approved" : "rejected",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    rejection_reason: action === "reject" ? (reason?.trim() ?? null) : null,
  };

  const { data: photo, error } = await supabase
    .from("profile_photos")
    .update(updateData)
    .eq("id", photoId)
    .select(`
      *,
      user:profiles!user_id(id, username, display_name, avatar_url)
    `)
    .single();

  if (error) {
    console.error("moderation/photos/[photoId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  return NextResponse.json({ photo });
});
