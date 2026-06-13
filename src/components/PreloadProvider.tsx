"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading, usePreloadError, useProfile, useTotalUnread } from "@/stores/selectors";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePresence } from "@/hooks/usePresence";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNearbyPresence } from "@/hooks/useNearbyPresence";
import { useMeetingDetection } from "@/hooks/useMeetingDetection";
import { useIncomingCall } from "@/hooks/useIncomingCall";

interface PreloadProviderProps {
  children: ReactNode;
}

function DeferredEffects({ profileId }: { profileId: string | undefined }) {
  useRealtimeSync();
  usePresence(profileId);
  useGeolocation();
  useNearbyPresence(profileId);
  useMeetingDetection(profileId);
  useIncomingCall(profileId);
  return null;
}

export function PreloadProvider({ children }: PreloadProviderProps) {
  const router = useRouter();
  const preloadAll = useAppStore((state) => state.preloadAll);
  const sessionExpired = useAppStore((state) => state.sessionExpired);
  const isPreloading = useIsPreloading();
  const preloadError = usePreloadError();
  const profile = useProfile();
  const totalUnread = useTotalUnread();
  const hasStartedPreload = useRef(false);
  const [deferred, setDeferred] = useState(false);

  // Session died mid-preload — route to login client-side so the SPA (and on
  // native, the persistent WebView) is not torn down by a hard redirect.
  useEffect(() => {
    if (sessionExpired) router.push("/login");
  }, [sessionExpired, router]);

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
