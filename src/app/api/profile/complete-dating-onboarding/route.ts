import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { calculateAge } from "@/lib/age";
import { MIN_AGE, MIN_DATING_PHOTOS } from "@/lib/constants";

export const POST = withAuth(async (_request, { user, supabase }) => {
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, date_of_birth, gender, orientation, relationship_goal")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed) {
    return NextResponse.json({ error: "ONBOARDING_NOT_COMPLETE" }, { status: 400 });
  }

  if (!profile.date_of_birth) {
    return NextResponse.json({ error: "MISSING_DOB" }, { status: 400 });
  }

  if (calculateAge(profile.date_of_birth) < MIN_AGE) {
    return NextResponse.json({ error: "UNDERAGE" }, { status: 403 });
  }

  if (!profile.gender || !profile.orientation) {
    return NextResponse.json({ error: "MISSING_IDENTITY" }, { status: 400 });
  }

  if (!profile.relationship_goal) {
    return NextResponse.json({ error: "MISSING_GOAL" }, { status: 400 });
  }

  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("approval_status", "approved");

  const approvedCount = count ?? 0;
  if (approvedCount < MIN_DATING_PHOTOS) {
    return NextResponse.json(
      { error: "INSUFFICIENT_PHOTOS", required: MIN_DATING_PHOTOS, current: approvedCount },
      { status: 400 }
    );
  }

  const { data: prefs } = await supabase
    .from("dating_preferences")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prefs) {
    return NextResponse.json({ error: "MISSING_PREFERENCES" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ dating_onboarding_completed: true })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "PROFILE_UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
