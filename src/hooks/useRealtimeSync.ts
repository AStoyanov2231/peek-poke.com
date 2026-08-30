"use client";
import { useQuery } from "@tanstack/react-query";
import { useIsPreloading } from "@/stores/selectors";
import { useRealtimeUserSync } from "@/features/chat/useRealtimeDM";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { bootstrapQueryOptions } from "@/data/web-query";

/**
 * Orchestrator hook that sets up all realtime Supabase channel subscriptions.
 *
 * Delegates to two focused sub-hooks:
 *  - useRealtimeUserSync: one private user channel for DM and friendship hints
 *  - useRealtimeProfiles: Profile updates channel
 *
 * Each sub-hook manages its own channel lifecycle and cleanup.
 */
export function useRealtimeSync() {
  const isPreloading = useIsPreloading();
  const userId = useQuery(bootstrapQueryOptions).data?.identity.id;

  useRealtimeUserSync({ userId, isPreloading });

  useRealtimeProfiles({ isPreloading });
}
