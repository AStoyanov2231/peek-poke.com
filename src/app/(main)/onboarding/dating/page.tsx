import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DatingOnboardingClient } from "./DatingOnboardingClient";

export default async function DatingOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dating_onboarding_completed, onboarding_completed, date_of_birth, gender, orientation, height_cm, relationship_goal, smoking, drinking, has_kids")
    .eq("id", user.id)
    .single();

  if (profile?.dating_onboarding_completed) redirect("/");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { count: approvedPhotoCount } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("approval_status", "approved");

  const { data: existingPreferences } = await supabase
    .from("dating_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <DatingOnboardingClient
      profile={profile}
      approvedPhotoCount={approvedPhotoCount ?? 0}
      existingPreferences={existingPreferences ?? null}
    />
  );
}
