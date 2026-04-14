"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";

const DEBOUNCE_MS = 5000;

export function useGeolocation() {
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastUpdate.current < DEBOUNCE_MS) return;
        lastUpdate.current = now;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          console.warn("Geolocation permission denied");
        }
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [setUserLocation]);
}
