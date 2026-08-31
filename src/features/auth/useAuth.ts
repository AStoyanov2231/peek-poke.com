"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";
import { useAppStore } from "@/stores/appStore";
import { currentProfileResponseSchema } from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import { resetFriendMutationAttempts } from "@/data/friend-mutations";
import { observeMeetingAuthOwner } from "@/data/web-query";
import { observeReadReceiptAuthOwner } from "@/data/read-receipt";

// Get the singleton client
const supabase = createClient();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Track current user ID to avoid unnecessary refetches
  const currentUserIdRef = useRef<string | null>(null);
  const profileOwnerIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      const data = await fetchContract("/api/profile", currentProfileResponseSchema);
      return data.profile;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let authGeneration = 0;

    const isCurrentAuth = (generation: number) => (
      isMounted && authGeneration === generation
    );

    const initializeAuth = async (initialAuthGeneration: number) => {
      try {
        // Use getSession() instead of getUser() - reads from local storage without network request
        // Middleware already validated the session, so we can trust it
        const { data: { session } } = await supabase.auth.getSession();
        if (!isCurrentAuth(initialAuthGeneration)) return;
        const authUser = session?.user ?? null;
        observeMeetingAuthOwner(authUser?.id ?? null);
        observeReadReceiptAuthOwner(authUser?.id ?? null);

        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
          if (!isCurrentAuth(initialAuthGeneration)) return;
        }

        setUser(authUser);

        if (authUser) {
          currentUserIdRef.current = authUser.id;
          const fetchedProfile = await fetchProfile();
          if (isCurrentAuth(initialAuthGeneration)) {
            profileOwnerIdRef.current = authUser.id;
            setProfile(fetchedProfile);
          }
        }
      } catch (error) {
        if (isCurrentAuth(initialAuthGeneration)) {
          console.error("Error initializing auth:", error);
        }
      } finally {
        if (isCurrentAuth(initialAuthGeneration)) {
          setLoading(false);
        }
      }
    };

    // Subscribe before starting the asynchronous snapshot read so no auth event can
    // be missed between getSession() and listener registration.
    const initialAuthGeneration = authGeneration;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const eventAuthGeneration = ++authGeneration;
        if (!isMounted) return;
        const authUser = session?.user ?? null;
        observeMeetingAuthOwner(authUser?.id ?? null);
        observeReadReceiptAuthOwner(authUser?.id ?? null);

        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
          if (!isCurrentAuth(eventAuthGeneration)) return;
        }

        // Always update the user state
        setUser(authUser);

        if (authUser) {
          // Only fetch profile if user actually changed (not just token refresh)
          if (
            currentUserIdRef.current !== authUser.id
            || profileOwnerIdRef.current !== authUser.id
          ) {
            if (currentUserIdRef.current !== null) resetFriendMutationAttempts();
            useAppStore.getState().markLocationStale();
            currentUserIdRef.current = authUser.id;
            const fetchedProfile = await fetchProfile();
            if (isCurrentAuth(eventAuthGeneration)) {
              profileOwnerIdRef.current = authUser.id;
              setProfile(fetchedProfile);
            }
          }
        } else {
          // User signed out - clear store and local state
          currentUserIdRef.current = null;
          profileOwnerIdRef.current = null;
          resetFriendMutationAttempts();
          setProfile(null);
          useAppStore.getState().clearStore();
        }

        // Ensure loading is false after any auth event
        if (isCurrentAuth(eventAuthGeneration)) {
          setLoading(false);
        }
      }
    );

    initializeAuth(initialAuthGeneration);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  return { user, profile, loading };
}
