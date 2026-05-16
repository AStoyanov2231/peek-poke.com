"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading, useUserLocation } from "@/stores/selectors";
import { TRACK_DEBOUNCE_MS } from "@/lib/constants";
import type { NearbyUser } from "@/types/database";

const POLL_INTERVAL_MS = 10_000;
const RADIUS_KM = 2;

export function useNearbyPresence(userId: string | undefined) {
  const isPreloading = useIsPreloading();
  const userLocation = useUserLocation();
  const setNearbyUsers = useAppStore((s) => s.setNearbyUsers);

  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastTrackRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Push own location to server whenever it changes (debounced)
  useEffect(() => {
    if (!userId || !userLocation) return;
    const now = Date.now();
    if (now - lastTrackRef.current < TRACK_DEBOUNCE_MS) return;
    lastTrackRef.current = now;
    lastLocationRef.current = userLocation;

    fetch("/api/location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: userLocation.lat, lng: userLocation.lng }),
    }).catch(() => {});
  }, [userLocation, userId]);

  // Poll nearby users on an interval
  useEffect(() => {
    if (isPreloading || !userId) return;

    const fetchNearby = async () => {
      const loc = lastLocationRef.current ?? useAppStore.getState().userLocation;
      if (!loc) return;

      try {
        const res = await fetch("/api/nearby", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius_km: RADIUS_KM }),
        });
        if (!res.ok) return;
        const { users } = await res.json() as { users: NearbyUser[] };
        setNearbyUsers(users);
      } catch {
        // Network error — keep stale nearby list
      }
    };

    fetchNearby();
    pollTimerRef.current = setInterval(fetchNearby, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isPreloading, userId, setNearbyUsers]);
}
