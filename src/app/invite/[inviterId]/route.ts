import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ inviterId: string }> }
) {
  const { inviterId } = await params;
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?invite=${inviterId}`);
  }

  if (user.id !== inviterId) {
    await supabase.rpc("accept_invite_link", { p_inviter_id: inviterId });
  }

  return NextResponse.redirect(`${origin}/profile/${inviterId}`);
}
