import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";

/**
 * Native OAuth sign-in. Google (and Apple) block OAuth inside embedded
 * webviews, so the flow runs in the system browser (SFSafariViewController):
 *
 *   WebView: signInWithOAuth(skipBrowserRedirect) — PKCE verifier stays in
 *   THIS client's storage → Browser.open(provider URL) → provider →
 *   /auth/native-callback (system browser) → peekpoke://oauth-callback?code=…
 *   → SceneDelegate → `oauthCallback` bridge event → NativeBridgeProvider
 *   exchanges the code for a session inside the WebView.
 */
export async function nativeOAuthSignIn(
  provider: "google" | "apple",
  next?: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const redirectTo = new URL("/auth/native-callback", window.location.origin);
  if (next) redirectTo.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo.toString(),
      skipBrowserRedirect: true,
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  if (error || !data?.url) {
    return { error: error?.message ?? "Failed to start sign-in. Please try again." };
  }

  await Browser.open({ url: data.url });
  return {};
}
