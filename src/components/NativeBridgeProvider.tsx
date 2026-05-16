"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
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

  if (!response.ok) return false;

  const payload = (await response.json()) as { next?: string };
  return payload.next ?? next;
}

export function NativeBridgeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const handoffAttempted = useRef(false);
  const lastChecked = useRef<number>(0);
  const pathnameRef = useRef(pathname);

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

      const next = await mintWebSessionFromNativeAuth("/inbox");
      if (next) router.replace(next);
    };

    attemptHandoff();
  }, [pathname, router]);

  // Mark <html> as native so CSS can apply edge-to-edge safe area handling.
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("is-native");
    return () => { document.documentElement.classList.remove("is-native"); };
  }, []);

  // Keep pathnameRef in sync so the navigate listener can read current pathname without stale closure
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Subscribe to native navigation, foreground, and refresh events
  useEffect(() => {
    if (!isNativeApp()) return;

    const supabase = createClient();
    const handles: Array<Promise<{ remove: () => void }>> = [];

    // Native tab tap or map pin tap → SPA navigate
    const navigateHandle = PeekPokeBridge.addListener("navigate", ({ route }) => {
      if (!isAllowed(route)) return;
      if (route === pathnameRef.current) return;
      router.push(route);
    });
    handles.push(navigateHandle);

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
