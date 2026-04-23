"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";

export function useBots() {
  const hasFetched = useRef(false);

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      if (hasFetched.current || !state.userLocation) return;
      hasFetched.current = true;
      const { lat, lng } = state.userLocation;
      fetch(`/api/bots?lat=${lat}&lng=${lng}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) useAppStore.getState().setBots(data);
        })
        .catch((err) => console.error("useBots fetch failed:", err));
    });
  }, []);
}
