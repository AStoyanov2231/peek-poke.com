import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DiscoverClient } from "@/components/discover/DiscoverClient";

export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dating_onboarding_completed")
    .eq("id", user.id)
    .single();

  if (!profile?.dating_onboarding_completed) {
    redirect("/onboarding/dating");
  }

  return <DiscoverClient />;
}
