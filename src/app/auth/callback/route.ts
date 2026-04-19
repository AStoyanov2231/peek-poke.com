import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const USERNAME_ID_LENGTH = 8;

function isValidInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Validate that next is a safe internal path
  const next = isValidInternalPath(nextParam) ? nextParam : "/";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("Auth callback error:", error, errorDescription);
    const redirectUrl = new URL("/login", origin);
    redirectUrl.searchParams.set("error", errorDescription || error);
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

    // Create profile for OAuth users if it doesn't exist
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        const serviceClient = createServiceClient();
        // Use temp username for new OAuth users - they'll set proper username in onboarding
        const tempUsername = `user_${user.id.slice(0, USERNAME_ID_LENGTH)}`;

        const { error: profileError } = await serviceClient.from("profiles").insert({
          id: user.id,
          username: tempUsername,
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          onboarding_completed: false,
        });

        if (profileError) {
          console.error("Failed to create profile for OAuth user:", profileError);
          // Continue anyway - profile creation will be retried on next login
        }

        // New user - redirect to onboarding, preserving invite if present
        const inviteMatch = next.match(/^\/invite\/([a-zA-Z0-9-]+)$/);
        const onboardingUrl = inviteMatch
          ? `${origin}/onboarding?invite=${inviteMatch[1]}`
          : `${origin}/onboarding`;
        return NextResponse.redirect(onboardingUrl);
      }
    }
  }

  // Existing user - redirect to intended destination (middleware will handle onboarding check)
  return NextResponse.redirect(`${origin}${next}`);
}
