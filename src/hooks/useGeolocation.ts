"use client";

import { useEffect, useRef } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { useAppStore } from "@/stores/appStore";
import { isNativeApp } from "@/lib/native";

const DEBOUNCE_MS = 5000;

export function useGeolocation() {
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const setLocationStatus = useAppStore((s) => s.setLocationStatus);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!isNativeApp()) {
      // Web path: raw navigator.geolocation
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      setLocationStatus("prompting");
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastUpdate.current < DEBOUNCE_MS) return;
          lastUpdate.current = now;
          setLocationStatus("granted");
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            console.warn("Geolocation denied");
            setLocationStatus("denied");
          }
        },
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }

    // Native path: Capacitor Geolocation plugin → CLLocationManager
    let watchId: string | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        setLocationStatus("prompting");
        const perm = await Geolocation.requestPermissions();
        if (cancelled) return;
        if (perm.location !== "granted") {
          console.warn("[geo] permission not granted:", perm.location);
          setLocationStatus("denied");
          return;
        }
        setLocationStatus("granted");
        // Grab one position immediately so the map centres without waiting for watch
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
          if (!cancelled) {
            lastUpdate.current = Date.now();
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        } catch (e) {
          console.warn("[geo] getCurrentPosition failed:", e);
        }
        if (cancelled) return;
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 },
          (pos, err) => {
            if (err || !pos) { console.warn("[geo] watchPosition error:", err); return; }
            const now = Date.now();
            if (now - lastUpdate.current < DEBOUNCE_MS) return;
            lastUpdate.current = now;
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        );
      } catch (e) {
        console.warn("[geo] setup error:", e);
      }
    };

    setup();
    return () => {
      cancelled = true;
      if (watchId !== undefined) Geolocation.clearWatch({ id: watchId });
    };
  }, [setUserLocation, setLocationStatus]);
}
