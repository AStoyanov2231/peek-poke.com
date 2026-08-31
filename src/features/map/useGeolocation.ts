"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";

const DEBOUNCE_MS = 5000;

export function useGeolocation(userId: string | undefined) {
  const setDeviceLocation = useAppStore((s) => s.setDeviceLocation);
  const setDeviceLocationError = useAppStore((s) => s.setDeviceLocationError);
  const setLocationDenied = useAppStore((s) => s.setLocationDenied);
  const markLocationStale = useAppStore((s) => s.markLocationStale);
  const setLocationStatus = useAppStore((s) => s.setLocationStatus);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!userId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDeviceLocationError(userId, "Location is unavailable in this browser.");
      return;
    }
    let active = true;
    lastUpdate.current = 0;
    markLocationStale();
    setLocationStatus("prompting");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!active) return;
        const now = Date.now();
        if (now - lastUpdate.current < DEBOUNCE_MS) return;
        lastUpdate.current = now;
        setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (!active) return;
        if (err.code === err.PERMISSION_DENIED) {
          console.warn("Geolocation denied");
          setLocationDenied(userId);
          return;
        }
        setDeviceLocationError(userId, err.message || "Could not refresh your location.");
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [markLocationStale, setDeviceLocation, setDeviceLocationError, setLocationDenied, setLocationStatus, userId]);
}
