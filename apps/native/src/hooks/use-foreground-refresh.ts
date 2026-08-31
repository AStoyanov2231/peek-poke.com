import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { refreshEntitlements } from "@/lib/billing";
import { nativeQueryClient } from "@/data/query-client";
import { isNativeUserSyncQueryKey } from "@/data/query-keys";
import { expireDeviceLocationIfNeeded } from "@/lib/location";

const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30_000;

export function useForegroundRefresh(enabled: boolean) {
  const refreshInFlight = useRef(false);
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    lastRefreshAt.current = Date.now();
    let previousState = AppState.currentState;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const returnedToForeground = nextState === "active" && previousState !== "active";
      previousState = nextState;
      if (!returnedToForeground) return;
      const now = Date.now();
      expireDeviceLocationIfNeeded(now);
      if (refreshInFlight.current) return;
      if (now - lastRefreshAt.current < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return;
      lastRefreshAt.current = now;
      refreshInFlight.current = true;
      void Promise.all([
        refreshEntitlements(),
        nativeQueryClient.invalidateQueries({
          refetchType: "active",
          predicate: (query) => !isNativeUserSyncQueryKey(query.queryKey),
        }),
      ])
        .catch((error) => console.warn("Foreground refresh failed:", error))
        .finally(() => {
          refreshInFlight.current = false;
        });
    });

    return () => subscription.remove();
  }, [enabled]);
}
