"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";
import { SplashScreen } from "@capacitor/splash-screen";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";

/**
 * Syncs auth state, tokens, and role to the native iOS shell via Capacitor plugin.
 * - Calls setAuth / clearAuth on every Supabase auth event so native Keychain stays fresh.
 * - Calls setRole whenever the admin role flips.
 * - Hides the native splash screen after the first session check completes.
 */
export function AuthBridgeProvider({ children }: { children: ReactNode }) {
  const readyFired = useRef(false);

  // --- Auth token sync ---
  useEffect(() => {
    if (!isNativeApp()) return;

    const supabase = createClient();

    const syncSession = async (
      session: { access_token: string; refresh_token?: string; expires_at?: number } | null | undefined,
      { signOut = false } = {}
    ) => {
      if (session) {
        await PeekPokeBridge.setAuth({
          accessToken: session.access_token,
          refreshToken: session.refresh_token ?? null,
          expiresAt: session.expires_at ?? null,
        });
      } else if (signOut) {
        // Only wipe Keychain on an explicit sign-out, not on every null session check.
        // Hidden or redirecting WebViews can have no session without meaning the user signed out.
        await PeekPokeBridge.clearAuth();
      }

      if (!readyFired.current) {
        readyFired.current = true;
        await SplashScreen.hide({ fadeOutDuration: 300 });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => syncSession(session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) =>
      syncSession(session, { signOut: event === "SIGNED_OUT" })
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Admin role sync ---
  useEffect(() => {
    if (!isNativeApp()) return;

    const computeIsAdmin = (state: ReturnType<typeof useAppStore.getState>) =>
      state.profile?.roles?.includes("admin") ?? false;

    let last: boolean | null = null;
    const sendIfChanged = (isAdmin: boolean) => {
      if (last === isAdmin) return;
      last = isAdmin;
      PeekPokeBridge.setRole({ isAdmin });
    };

    sendIfChanged(computeIsAdmin(useAppStore.getState()));
    const unsubscribe = useAppStore.subscribe((state) => sendIfChanged(computeIsAdmin(state)));
    return () => unsubscribe();
  }, []);

  return <>{children}</>;
}
