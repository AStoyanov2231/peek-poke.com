"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/appStore";
import { useIsPreloading, useUserLocation } from "@/stores/selectors";
import { haversineKm } from "@/lib/geo";
import { TRACK_DEBOUNCE_MS } from "@/lib/constants";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { NearbyUser } from "@/types/database";

const supabase = createClient();
const RADIUS_KM = 2;

export function useNearbyPresence(userId: string | undefined) {
  const isPreloading = useIsPreloading();
  const userLocation = useUserLocation();
  const setNearbyUsers = useAppStore((s) => s.setNearbyUsers);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSetupRef = useRef(false);
  const lastTrackRef = useRef(0);

  // Track location changes
  useEffect(() => {
    if (!channelRef.current || !userLocation || !userId) return;
    let cancelled = false;
    const now = Date.now();
    if (now - lastTrackRef.current < TRACK_DEBOUNCE_MS) return;
    lastTrackRef.current = now;
    const profile = useAppStore.getState().profile;
    if (!cancelled) {
      channelRef.current.track({
        userId,
        username: profile?.username || "",
        avatar_url: profile?.avatar_url || null,
        display_name: profile?.display_name || null,
        lat: userLocation.lat,
        lng: userLocation.lng,
      });
    }
    return () => { cancelled = true; };
  }, [userLocation, userId]);

  useEffect(() => {
    if (isPreloading || !userId) return;
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    const channel = supabase.channel("user-locations", {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const loc = useAppStore.getState().userLocation;
      const nearby: NearbyUser[] = [];

      for (const key of Object.keys(state)) {
        if (key === userId) continue;
        const presences = state[key] as unknown as NearbyUser[];
        if (!presences?.[0]) continue;
        const p = presences[0];
        if (loc && haversineKm(loc.lat, loc.lng, p.lat, p.lng) <= RADIUS_KM) {
          nearby.push(p);
        }
      }
      setNearbyUsers(nearby);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const loc = useAppStore.getState().userLocation;
        const profile = useAppStore.getState().profile;
        if (loc) {
          lastTrackRef.current = Date.now();
          await channel.track({
            userId,
            username: profile?.username || "",
            avatar_url: profile?.avatar_url || null,
            display_name: profile?.display_name || null,
            lat: loc.lat,
            lng: loc.lng,
          });
        }
      }
    });

    channelRef.current = channel;

    return () => {
      isSetupRef.current = false;
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isPreloading, userId, setNearbyUsers]);
}
