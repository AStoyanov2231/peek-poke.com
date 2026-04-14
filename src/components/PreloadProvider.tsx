"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading, usePreloadError, useProfile, useTotalUnread } from "@/stores/selectors";
import { isNativeApp, postToNative } from "@/lib/native";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePresence } from "@/hooks/usePresence";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNearbyPresence } from "@/hooks/useNearbyPresence";
import { useMeetingDetection } from "@/hooks/useMeetingDetection";

interface PreloadProviderProps {
  children: ReactNode;
}

export function PreloadProvider({ children }: PreloadProviderProps) {
  const preloadAll = useAppStore((state) => state.preloadAll);
  const isPreloading = useIsPreloading();
  const preloadError = usePreloadError();
  const profile = useProfile();
  const totalUnread = useTotalUnread();
  const hasStartedPreload = useRef(false);

  // Set up Realtime sync (only activates after preload completes)
  useRealtimeSync();

  // Set up Presence tracking for online status
  usePresence(profile?.id);

  // Set up geolocation and nearby user presence
  useGeolocation();
  useNearbyPresence(profile?.id);
  useMeetingDetection(profile?.id);

  useEffect(() => {
    // Only trigger preload once
    if (!hasStartedPreload.current) {
      hasStartedPreload.current = true;
      preloadAll();
    }
  }, [preloadAll]);

  // Sync unread count to native app for tab badge
  useEffect(() => {
    if (isNativeApp()) {
      postToNative("updateBadge", { tab: "messages", count: totalUnread });
    }
  }, [totalUnread]);

  // SplashScreen handles its own visibility based on isPreloading/preloadError
  return <>{children}</>;
}
