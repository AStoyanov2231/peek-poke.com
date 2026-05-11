"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";
import { createClient } from "@/lib/supabase/client";
import { SplashScreen } from "@capacitor/splash-screen";

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

/** Derive the logical tab name from a route for setLastRoute reporting. */
function routeToTab(route: string): string | null {
  if (route.startsWith("/inbox") || route.startsWith("/chat")) return "inbox";
  if (route.startsWith("/profile")) return "profile";
  if (route.startsWith("/admin")) return "admin";
  return null;
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

  // Hide the native splash screen once the web UI is mounted.
  useEffect(() => {
    if (!isNativeApp()) return;
    SplashScreen.hide({ fadeOutDuration: 300 });
  }, []);

  // Mark <html> as native so CSS can apply edge-to-edge safe area handling.
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("is-native");
    return () => { document.documentElement.classList.remove("is-native"); };
  }, []);

  // Toggle native-map class on <html> so CSS can make the layout background transparent
  // when the shared WebView is acting as a map overlay over the native Mapbox canvas.
  useEffect(() => {
    if (!isNativeApp()) return;
    const isMapRoute = pathname === "/";
    document.documentElement.classList.toggle("native-map", isMapRoute);
  }, [pathname]);

  // Track current route so native can restore per-tab last-route
  useEffect(() => {
    if (!isNativeApp()) return;
    const tab = routeToTab(pathname);
    if (tab) {
      PeekPokeBridge.setLastRoute({ tab, route: pathname });
    }
  }, [pathname]);

  // Subscribe to native navigation, foreground, and refresh events
  useEffect(() => {
    if (!isNativeApp()) return;

    const supabase = createClient();
    const handles: Array<Promise<{ remove: () => void }>> = [];

    // Native tab tap or map pin tap → SPA navigate
    const navigateHandle = PeekPokeBridge.addListener("navigate", ({ route }) => {
      if (!isAllowed(route)) return;
      router.push(route);
    });
    handles.push(navigateHandle);

    // App foregrounded → re-validate session
    const resumeHandle = PeekPokeBridge.addListener("appResumed", async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
      }
    });
    handles.push(resumeHandle);

    // Native APIClient got a 401 → refresh session and hand new tokens back
    const refreshHandle = PeekPokeBridge.addListener("refreshNeeded", async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
        await PeekPokeBridge.setAuth({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ?? null,
        });
      } else {
        // Refresh failed — push user to login
        router.push("/login");
      }
    });
    handles.push(refreshHandle);

    // Native performed a proactive refresh (e.g. cold launch) → sync back to WebView session
    const authRefreshHandle = PeekPokeBridge.addListener("authRefresh", async ({ accessToken, refreshToken }) => {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    });
    handles.push(authRefreshHandle);

    return () => {
      handles.forEach((h) => h.then((handle) => handle.remove()).catch(() => {}));
    };
  }, [router]);

  return <>{children}</>;
}
