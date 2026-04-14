"use server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { validateEmail, isValidEmailFormat } from "@/lib/email-validation";

// Constants
const USERNAME_ID_LENGTH = 8;
const MIN_PASSWORD_LENGTH = 8;

export async function login(formData: FormData) {
  // Input validation
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    !email ||
    !password ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Email and password are required." };
  }

  // Validate email format only (no typo check for login - user knows their email)
  if (!isValidEmailFormat(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // Check if user hasn't confirmed email yet
    if (error.message.includes("Email not confirmed")) {
      return { emailNotConfirmed: true };
    }
    return { error: "Invalid email or password" };
  }

  // Ensure profile exists after login
  if (data.user) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .single();

    if (!existingProfile) {
      const serviceClient = createServiceClient();
      const username =
        data.user.user_metadata?.username ||
        `user_${data.user.id.slice(0, USERNAME_ID_LENGTH)}`;
      const { error: profileError } = await serviceClient
        .from("profiles")
        .insert({
          id: data.user.id,
          username,
          display_name:
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null,
          avatar_url: data.user.user_metadata?.avatar_url || null,
          onboarding_completed: false,
        });

      if (profileError) {
        console.error("Failed to create profile during login:", profileError);
        // Continue anyway - profile creation will be retried on next login
      }
    }
  }

  // Note: Middleware will redirect to /onboarding if onboarding_completed is false
  redirect("/");
}

export async function signup(formData: FormData) {
  // Input validation - only email and password required (username collected during onboarding)
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || typeof email !== "string") {
    return { error: "Email is required." };
  }

  if (!password || typeof password !== "string") {
    return { error: "Password is required." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  // Validate email (format + typos + disposable check)
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    // Return error with suggestion if available
    return {
      error: emailValidation.error,
      suggestion: emailValidation.suggestion,
    };
  }

  const supabase = await createClient();

  // Use the correct app URL for email confirmation redirect
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    // Provide user-friendly error messages
    if (
      error.message.includes("already registered") ||
      error.message.includes("User already registered")
    ) {
      return { error: "This email is already registered. Please log in instead." };
    }
    return { error: "Could not create account" };
  }

  // Check if signup actually created a user (email confirmation may be enabled)
  if (!data.user) {
    return { error: "Signup failed. Please try again." };
  }

  // Profile creation happens in /auth/callback after email confirmation
  // This prevents bots from creating profiles without verifying email

  // Check if email confirmation is required (no session means email not confirmed yet)
  if (!data.session) {
    return { emailConfirmation: true };
  }

  // Redirect to onboarding instead of messages
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function isValidRedirectPath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://")
  );
}

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", appUrl);
  if (redirectTo && isValidRedirectPath(redirectTo)) {
    callbackUrl.searchParams.set("next", redirectTo);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
  return { error: "Failed to initiate Google sign-in. Please try again." };
}

export async function signInWithApple(redirectTo?: string) {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", appUrl);
  if (redirectTo && isValidRedirectPath(redirectTo)) {
    callbackUrl.searchParams.set("next", redirectTo);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
  return { error: "Failed to initiate Apple sign-in. Please try again." };
}
