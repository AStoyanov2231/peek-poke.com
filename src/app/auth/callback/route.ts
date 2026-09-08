import { onboardingRedirect } from "@/lib/onboarding-redirect";
import { ageAdmissionRedirect } from "@/lib/age-admission-redirect";
import { readAccountAgeAdmission } from "@/features/age-admission/server/age-admission";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSafeInternalRedirect } from "@/lib/internal-redirect";
import { ensureAuthProfile } from "@/lib/auth-profile";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // URL redirect state is constrained to an internal allowlisted path below.
  // react-doctor-disable-next-line url-prefilled-privileged-action
  const nextParam = searchParams.get("next") ?? "/";
  // Validate that next is a safe internal path
  const next = isSafeInternalRedirect(nextParam) ? nextParam : "/";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("Auth callback error:", error, errorDescription);
    const redirectUrl = new URL("/login", origin);
    redirectUrl.searchParams.set("error", "Failed to authenticate. Please try again.");
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Code exchange error:", exchangeError);
      const redirectUrl = new URL("/login", origin);
      redirectUrl.searchParams.set("error", "Failed to authenticate. Please try again.");
      return NextResponse.redirect(redirectUrl);
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const redirectUrl = new URL("/login", origin);
      redirectUrl.searchParams.set("error", "Failed to authenticate. Please try again.");
      return NextResponse.redirect(redirectUrl);
    }

    const profile = await ensureAuthProfile(user);
    if (profile.status !== "ready") {
      if (profile.status === "failed") {
        console.error("Failed to prepare profile during auth callback:", profile.cause);
      }
      await supabase.auth.signOut({ scope: "local" });
      const redirectUrl = new URL("/login", origin);
      redirectUrl.searchParams.set("error", "Failed to authenticate. Please try again.");
      return NextResponse.redirect(redirectUrl);
    }

    // Password recovery is an account control that remains available before
    // admission and onboarding. The route still requires the exchanged session.
    if (next === "/reset-password") {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }

    const admission = await readAccountAgeAdmission(user.id);
    if (admission.unavailable || admission.data.status !== "adult") {
      return NextResponse.redirect(new URL(ageAdmissionRedirect(next), origin));
    }

    if (!profile.profile.onboarding_completed) {
      return NextResponse.redirect(new URL(onboardingRedirect(next), origin));
    }
  }

  // Existing user - redirect to intended destination (middleware will handle onboarding check)
  return NextResponse.redirect(`${origin}${next}`);
}
