"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isValidEmailFormat, validateEmail } from "@peekpoke/shared";
import { isSafeInternalRedirect } from "@/lib/internal-redirect";
import { ensureAuthProfile } from "@/lib/auth-profile";

// Constants
const MIN_PASSWORD_LENGTH = 8;

export async function login(formData: FormData) {
  // Input validation
  const email = formData.get("email");
  const password = formData.get("password");
  const requestedRedirect = formData.get("redirectTo");
  const redirectTo = isSafeInternalRedirect(requestedRedirect)
    ? requestedRedirect
    : "/";

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
    return { error: "Invalid email or password" };
  }

  if (!data.user) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Could not prepare your account. Please try again." };
  }

  const profile = await ensureAuthProfile(data.user);
  if (profile.status !== "ready") {
    if (profile.status === "failed") {
      console.error("Failed to prepare profile during login:", profile.cause);
    }
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Could not prepare your account. Please try again." };
  }

  // Note: Middleware will redirect to /onboarding if onboarding_completed is false
  redirect(redirectTo);
}

export async function signup(formData: FormData) {
  // Input validation - only email and password required (username collected during onboarding)
  const email = formData.get("email");
  const password = formData.get("password");
  const requestedRedirect = formData.get("redirectTo");
  const redirectTo = isSafeInternalRedirect(requestedRedirect)
    ? requestedRedirect
    : null;

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

  const confirmationUrl = new URL("/auth/callback", appUrl);
  if (redirectTo) confirmationUrl.searchParams.set("next", redirectTo);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmationUrl.toString(),
    },
  });

  if (error) {
    return { emailConfirmation: true };
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

  const profile = await ensureAuthProfile(data.user);
  if (profile.status !== "ready") {
    if (profile.status === "failed") {
      console.error("Failed to prepare profile during signup:", profile.cause);
    }
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Could not prepare your account. Please try again." };
  }

  // Redirect to onboarding instead of messages
  const inviteMatch = redirectTo?.match(/^\/invite\/([a-zA-Z0-9-]+)$/);
  redirect(inviteMatch ? `/onboarding?invite=${inviteMatch[1]}` : "/onboarding");
}

// Public auth entry point: Supabase Auth enforces provider email rate limits;
// this action has no service-role access and intentionally requires no session.
// react-doctor-disable-next-line react-doctor/server-auth-actions
export async function resendSignupConfirmation(email: string, requestedRedirect?: string | null) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmailFormat(normalizedEmail)) {
    return { success: false };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const confirmationUrl = new URL("/auth/callback", appUrl);
  if (isSafeInternalRedirect(requestedRedirect)) {
    confirmationUrl.searchParams.set("next", requestedRedirect);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: { emailRedirectTo: confirmationUrl.toString() },
    });
    if (error) console.error("Failed to resend signup confirmation:", error.message);
    return { success: !error };
  } catch (error) {
    console.error("Failed to resend signup confirmation:", error);
    return { success: false };
  }
}

// Public auth entry point: Supabase Auth enforces provider email rate limits;
// this action has no service-role access and intentionally requires no session.
// react-doctor-disable-next-line react-doctor/server-auth-actions
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmailFormat(normalizedEmail)) return { success: false };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", "/reset-password");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: callbackUrl.toString(),
    });
    if (error) console.error("Failed to request password reset:", error.message);
    return { success: !error };
  } catch (error) {
    console.error("Failed to request password reset:", error);
    return { success: false };
  }
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("pp_onboarded");
  redirect("/login");
}

// OAuth initiation must be available before authentication. Redirects are
// restricted to safe internal paths and no privileged client is used.
// react-doctor-disable-next-line react-doctor/server-auth-actions
export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", appUrl);
  if (isSafeInternalRedirect(redirectTo)) {
    callbackUrl.searchParams.set("next", redirectTo);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) return { error: "Could not sign in with Google. Please try again." };
  if (data.url) redirect(data.url);
  return { error: "Failed to initiate Google sign-in. Please try again." };
}

// OAuth initiation must be available before authentication. Redirects are
// restricted to safe internal paths and no privileged client is used.
// react-doctor-disable-next-line react-doctor/server-auth-actions
export async function signInWithApple(redirectTo?: string) {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", appUrl);
  if (isSafeInternalRedirect(redirectTo)) {
    callbackUrl.searchParams.set("next", redirectTo);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error) return { error: "Could not sign in with Apple. Please try again." };
  if (data.url) redirect(data.url);
  return { error: "Failed to initiate Apple sign-in. Please try again." };
}
