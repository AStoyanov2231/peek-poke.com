import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async (_request, { user, supabase }) => {
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ profile: existing });
  }

  // Create profile from auth metadata
  const username = user.user_metadata?.username || `user_${user.id.slice(0, 8)}`;
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      username,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select()
    .single();

  if (insertError) {
    // Race condition: profile was created between SELECT and INSERT
    const { data: retryProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (retryProfile) {
      return NextResponse.json({ profile: retryProfile });
    }
    console.error("auth/profile:", insertError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ profile: created }, { status: 201 });
});
