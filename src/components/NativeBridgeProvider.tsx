"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Browser } from "@capacitor/browser";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";
import { initPushNotifications } from "@/lib/push-notifications";
import { createClient } from "@/lib/supabase/client";

/**
 * Routes native-initiated navigation to the Next.js router via Capacitor plugin events.
 * Handles session re-validation when the app foregrounds and token refresh requests from native.
 */

const ALLOWED_PREFIXES = [
  "/",
  "/inbox",
  "/profile",
  "/admin",
  "/chat",
  "/onboarding",
  "/login",
  "/welcome",
  "/invite",
];

function isAllowed(route: string): boolean {
  if (!route.startsWith("/")) return false;
  if (route === "/") return true;
  return ALLOWED_PREFIXES.some(
    (prefix) =>
      prefix !== "/" &&
      (route === prefix ||
        route.startsWith(prefix + "/") ||
        route.startsWith(prefix + "?"))
  );
}

// The navigate listener is module-scoped and permanent: providers remount when
// crossing layout groups (login ↔ main), and a per-mount listener leaves a gap
// where a native tab tap can fire with no listener attached (the event is then
// retained by Capacitor but consumed by the wrong/next subscriber). One global
// listener routed through a mutable ref to the latest router closes that gap.
const navigation: {
  router: { push: (route: string) => void } | null;
  pathname: string;
} = { router: null, pathname: "/" };

let navigateListenerAttached = false;

function attachNavigateListener() {
  if (navigateListenerAttached) return;
  navigateListenerAttached = true;
  PeekPokeBridge.addListener("navigate", ({ route }) => {
    if (!isAllowed(route)) return;
    if (route === navigation.pathname) return;
    navigation.router?.push(route);
  });
}

// OAuth return from the system browser (peekpoke://oauth-callback?code=…).
// Module-scoped for the same reason as the navigate listener: it must survive
// the login ↔ main layout-group remount that the sign-in itself triggers.
let oauthListenerAttached = false;

function attachOAuthListener() {
  if (oauthListenerAttached) return;
  oauthListenerAttached = true;
  PeekPokeBridge.addListener("oauthCallback", async ({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    // The SFSafariViewController stays presented after the scheme redirect
    await Browser.close().catch(() => {});

    const code = parsed.searchParams.get("code");
    if (!code) return;

    // The PKCE verifier lives in this WebView's Supabase client storage —
    // signInWithOAuth started here (native-oauth.ts), so the exchange must too.
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[oauth] code exchange failed:", error.message);
      return;
    }

    const next = parsed.searchParams.get("next");
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://")
        ? next
        : "/";
    navigation.router?.push(safeNext);
  });
}

async function mintWebSessionFromNativeAuth(next: string): Promise<string | false> {
  const stored = await PeekPokeBridge.getAuth();
  if (!stored.accessToken || !stored.refreshToken) return false;

  const response = await fetch("/auth/native-handoff", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      next,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    // Tokens are definitively dead (revoked/garbage) — clear the Keychain so the
    // native shell hides the tab bar instead of showing tabs over the login page.
    // Transient failures (network, 5xx) fall through and keep the tokens.
    await PeekPokeBridge.clearAuth();
    return false;
  }
  if (!response.ok) return false;

  const payload = (await response.json()) as { next?: string };
  return payload.next ?? next;
}

export function NativeBridgeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const handoffAttempted = useRef(false);
  const lastChecked = useRef<number>(0);

  // Auto-handoff: native cold-launch lands on /login while Keychain has valid tokens.
  // WKHTTPCookieStore was empty (reinstall/clear), so cookies weren't set. Use the
  // handoff route to mint new cookies from the Keychain tokens without putting
  // tokens in the navigation URL.
  useEffect(() => {
    if (!isNativeApp() || pathname !== "/login" || handoffAttempted.current) return;
    handoffAttempted.current = true;

    const attemptHandoff = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return; // Already have a web session — no handoff needed

      // "/" — land on the map, matching the shell's default selected tab
      const next = await mintWebSessionFromNativeAuth("/");
      if (next) router.replace(next);
    };

    attemptHandoff();
  }, [pathname, router]);

  // Mark <html> as native so CSS can apply edge-to-edge safe area handling.
  // Permanent — the platform doesn't change mid-session, and removing it during
  // layout-group remounts (login ↔ main) would flicker the safe-area layout.
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("is-native");
  }, []);

  // Keep the module-level navigation ref current for the permanent navigate listener
  useEffect(() => {
    navigation.router = router;
  }, [router]);
  useEffect(() => {
    navigation.pathname = pathname;
  }, [pathname]);

  // Single-WebView shell: report every route change so native syncs tab selection /
  // map visibility, and toggle the transparent-map layout for the persistent WebView.
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.toggle("native-map", pathname === "/");
    PeekPokeBridge.setActiveRoute({ route: pathname });
  }, [pathname]);

  // Warm the section routes once so the first native tab switch is instant.
  useEffect(() => {
    if (!isNativeApp()) return;
    router.prefetch("/inbox");
    router.prefetch("/profile");
  }, [router]);

  // Subscribe to native foreground and refresh events; the navigate listener is
  // permanent (module-scoped) so layout-group remounts can't drop tab taps.
  useEffect(() => {
    if (!isNativeApp()) return;

    attachNavigateListener();
    attachOAuthListener();

    const supabase = createClient();
    const handles: Array<Promise<{ remove: () => void }>> = [];

    // App foregrounded → re-validate session (throttled to once per 5 minutes)
    const resumeHandle = PeekPokeBridge.addListener("appResumed", async () => {
      const now = Date.now();
      if (now - lastChecked.current < 5 * 60 * 1000) return;
      lastChecked.current = now;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
      }
    });
    handles.push(resumeHandle);

    // Native performed a proactive refresh (e.g. cold launch) → sync back to WebView session
    const authRefreshHandle = PeekPokeBridge.addListener("authRefresh", async ({ accessToken, refreshToken }) => {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    });
    handles.push(authRefreshHandle);

    return () => {
      handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
    };
  }, [router]);

  // Push notifications — initialize once we have a signed-in user.
  // Re-running on auth-state-change keeps the token current after sign-in/out.
  useEffect(() => {
    if (!isNativeApp()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const supabase = createClient();
    const start = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      cleanup = await initPushNotifications({
        onNavigate: (route) => router.push(route),
      });
      if (cancelled) cleanup?.();
    };
    start();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        cleanup?.();
        start();
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return <>{children}</>;
}
