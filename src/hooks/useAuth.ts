"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";
import { useAppStore } from "@/stores/appStore";
import { isNativeApp, postToNative } from "@/lib/native";

// Get the singleton client
const supabase = createClient();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Track current user ID to avoid unnecessary refetches
  const currentUserIdRef = useRef<string | null>(null);

  const fetchOrCreateProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      const res = await fetch("/api/auth/profile", { method: "POST" });
      if (!res.ok) return null;
      const data = await res.json();
      return data.profile ?? null;
    } catch (error) {
      console.error("Error in fetchOrCreateProfile:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Use getSession() instead of getUser() - reads from local storage without network request
        // Middleware already validated the session, so we can trust it
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        const authUser = session?.user ?? null;
        setUser(authUser);

        if (authUser) {
          currentUserIdRef.current = authUser.id;
          const fetchedProfile = await fetchOrCreateProfile();
          if (isMounted) {
            setProfile(fetchedProfile);
            // Notify native app of auth state
            if (isNativeApp()) {
              postToNative("authStateChanged", { isAuthenticated: true });
            }
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        const authUser = session?.user ?? null;

        // Always update the user state
        setUser(authUser);

        if (authUser) {
          // Only fetch profile if user actually changed (not just token refresh)
          if (currentUserIdRef.current !== authUser.id) {
            currentUserIdRef.current = authUser.id;
            const fetchedProfile = await fetchOrCreateProfile();
            if (isMounted) {
              setProfile(fetchedProfile);
              // Notify native app of successful login
              if (isNativeApp()) {
                postToNative("authStateChanged", { isAuthenticated: true });
              }
            }
          }
        } else {
          // User signed out - clear store and local state
          currentUserIdRef.current = null;
          setProfile(null);
          useAppStore.getState().clearStore();
          // Notify native app of sign out
          if (isNativeApp()) {
            postToNative("authStateChanged", { isAuthenticated: false });
          }
        }

        // Ensure loading is false after any auth event
        if (isMounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchOrCreateProfile]);

  return { user, profile, loading };
}
