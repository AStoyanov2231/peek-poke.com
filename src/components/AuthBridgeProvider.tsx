"use client";

import { useEffect, type ReactNode } from "react";
import { isNativeApp, postToNative } from "@/lib/native";
import { createClient } from "@/lib/supabase/client";

/**
 * Provider that syncs auth state to the native iOS/Android app.
 * Sends `authStateChanged` message when user logs in or out.
 * This runs on ALL routes in the (main) layout.
 */
export function AuthBridgeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isNativeApp()) return;

    const supabase = createClient();

    // Check initial auth state and notify native
    supabase.auth.getSession().then(({ data: { session } }) => {
      postToNative("authStateChanged", {
        isAuthenticated: !!session?.user,
      });
    });

    // Listen for auth changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      postToNative("authStateChanged", {
        isAuthenticated: !!session?.user,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
