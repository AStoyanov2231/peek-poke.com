"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { useUserLocation, useIsPreloading } from "@/stores/selectors";

export function useBots() {
  const hasFetched = useRef(false);
  const loc = useUserLocation();
  const isPreloading = useIsPreloading();

  useEffect(() => {
    if (hasFetched.current || !loc || isPreloading) return;
    hasFetched.current = true;
    fetch(`/api/bots?lat=${loc.lat}&lng=${loc.lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) useAppStore.getState().setBots(data);
      })
      .catch((err) => console.error("useBots fetch failed:", err));
  }, [loc, isPreloading]);
}
