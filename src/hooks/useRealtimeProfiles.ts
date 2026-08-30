"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bootstrapQueryOptions, webQueryKeys } from "@/data/web-query";

const PROFILE_REFRESH_THROTTLE_MS = 30_000;

export function useRealtimeProfiles({ isPreloading }: { isPreloading: boolean }) {
  const queryClient = useQueryClient();
  const currentUserId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (isPreloading || !currentUserId) return;

    const refresh = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRefresh.current < PROFILE_REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.profile });
    };
    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    refresh(true);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserId, isPreloading, queryClient]);
}
