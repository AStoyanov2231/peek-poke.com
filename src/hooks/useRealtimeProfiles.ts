"use client";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";
import type { Profile } from "@/types/database";

const supabase = createClient();

interface UseRealtimeProfilesParams {
  isPreloading: boolean;
}

export function useRealtimeProfiles({ isPreloading }: UseRealtimeProfilesParams) {
  const isSetupRef = useRef<boolean>(false);
  const currentUserId = useAppStore((s) => s.profile?.id);

  useEffect(() => {
    if (isPreloading) return;
    if (!currentUserId) return;
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    let isMounted = true;

    // Channel for profile updates - scoped to own profile only
    const profilesChannel = supabase
      .channel("global-profiles")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!isMounted) return;
          const updatedFields = payload.new as Partial<Profile>;
          const currentProfile = useAppStore.getState().profile;
          if (currentProfile && currentProfile.id === updatedFields.id) {
            // Merge to preserve fields not in the DB row (e.g. roles from RPC)
            useAppStore.getState().setProfile({ ...currentProfile, ...updatedFields, roles: currentProfile.roles });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      isSetupRef.current = false;
      supabase.removeChannel(profilesChannel);
    };
  }, [isPreloading, currentUserId]);
}
