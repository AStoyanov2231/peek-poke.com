"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading, usePreloadError, useProfile, useTotalUnread } from "@/stores/selectors";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePresence } from "@/hooks/usePresence";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNearbyPresence } from "@/hooks/useNearbyPresence";
import { useMeetingDetection } from "@/hooks/useMeetingDetection";

interface PreloadProviderProps {
  children: ReactNode;
}

function DeferredEffects({ profileId }: { profileId: string | undefined }) {
  useRealtimeSync();
  usePresence(profileId);
  useGeolocation();
  useNearbyPresence(profileId);
  useMeetingDetection(profileId);
  return null;
}

export function PreloadProvider({ children }: PreloadProviderProps) {
  const preloadAll = useAppStore((state) => state.preloadAll);
  const isPreloading = useIsPreloading();
  const preloadError = usePreloadError();
  const profile = useProfile();
  const totalUnread = useTotalUnread();
  const hasStartedPreload = useRef(false);
  const [deferred, setDeferred] = useState(false);

  useEffect(() => {
    // Skip preloadAll when SSR already hydrated the store
    if (!hasStartedPreload.current) {
      hasStartedPreload.current = true;
      if (!useAppStore.getState().profile) {
        preloadAll();
      }
    }
  }, [preloadAll]);

  useEffect(() => {
    const id = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(() => setDeferred(true))
      : setTimeout(() => setDeferred(true), 0);
    return () => {
      if (typeof requestIdleCallback !== "undefined") cancelIdleCallback(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, []);

  useEffect(() => {
    if (isNativeApp()) {
      PeekPokeBridge.setTabBadge({ tab: "inbox", count: totalUnread });
      PeekPokeBridge.setAppBadge({ count: totalUnread });
    }
  }, [totalUnread]);

  return (
    <>
      {deferred && <DeferredEffects profileId={profile?.id} />}
      {children}
    </>
  );
}
