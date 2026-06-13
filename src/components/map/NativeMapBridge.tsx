"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import {
  useUserLocation,
  useNearbyUsers,
  useProfile,
  useFriends,
  useHighlightedUserId,
  usePendingUserId,
  useBots,
  useOnlineUsers,
} from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { useBots as useBotsHook } from "@/hooks/useBots";
import { PeekPokeBridge, type MapPin } from "@/lib/peekpoke-bridge";
import { haversineKm } from "@/lib/geo";
import { collectBot, BOT_COLLECT_RANGE_KM } from "@/lib/bots";
import type { PluginListenerHandle } from "@capacitor/core";

// Mirrors the 6-color palette in web's avatarColor() and Swift's MapPinPalette.
// Returns palette index 0–5 using the same hash as avatarColor().
function pinColorIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 6;
}

// Rough viewport bounds from camera center + zoom, used for cluster viewport.
// Native will emit exact bounds via mapCameraChanged; this is a fallback until first event.
function boundsFromCamera(
  lat: number,
  lng: number,
  zoom: number
): [number, number, number, number] {
  const tilesWide = (typeof window !== "undefined" ? window.innerWidth : 390) / 256;
  const tilesTall = (typeof window !== "undefined" ? window.innerHeight : 844) / 256;
  const degPerTile = 360 / Math.pow(2, zoom);
  const halfLng = (degPerTile * tilesWide) / 2;
  const halfLat = (degPerTile * tilesTall) / 2;
  return [lng - halfLng, lat - halfLat, lng + halfLng, lat + halfLat];
}

interface Camera {
  lat: number;
  lng: number;
  zoom: number;
  bearing: number;
  pitch: number;
  bounds: [number, number, number, number];
}

/**
 * Invisible component (renders null) that bridges Zustand pin data to the native
 * Mapbox map via PeekPokeBridge.setMapPins. Only mounted when isNativeApp() is true.
 */
export function NativeMapBridge() {
  const userLocation = useUserLocation();
  const nearbyUsers = useNearbyUsers();
  const profile = useProfile();
  const friends = useFriends();
  const highlightedUserId = useHighlightedUserId();
  const pendingUserId = usePendingUserId();
  const bots = useBots();
  const onlineUsers = useOnlineUsers();
  const selectUser = useAppStore((s) => s.selectUser);
  const setVisibleUsers = useAppStore((s) => s.setVisibleUsers);
  const setSelectedClusterUserIds = useAppStore((s) => s.setSelectedClusterUserIds);
  useBotsHook();

  const [camera, setCamera] = useState<Camera | null>(null);
  // Tapped cluster pin id — drives the selected ring (web's selectedClusterId)
  const [selectedClusterPinId, setSelectedClusterPinId] = useState<string | null>(null);
  const hasCenteredRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  // Center native map on user's location on first arrival
  useEffect(() => {
    if (!userLocation || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    PeekPokeBridge.setMapCamera({
      lat: userLocation.lat,
      lng: userLocation.lng,
      zoom: 17,
      pitch: 50,
      bearing: 0,
      animated: false,
    });
  }, [userLocation]);

  // Fly native map to highlighted user, then orbit (web MapView easeTo + orbit parity)
  useEffect(() => {
    if (!highlightedUserId) return;
    const user = useAppStore.getState().nearbyUsers.find((u) => u.userId === highlightedUserId);
    if (!user) return;
    PeekPokeBridge.setMapCamera({
      lat: user.lat,
      lng: user.lng,
      zoom: 17,
      pitch: 50,
      animated: true,
      durationMs: 700,
    });
    const orbitTimer = setTimeout(() => {
      PeekPokeBridge.setMapOrbit({ active: true });
    }, 700);
    return () => {
      clearTimeout(orbitTimer);
      PeekPokeBridge.setMapOrbit({ active: false });
    };
  }, [highlightedUserId]);

  // Forward recenter-map events from RecenterButton to native camera
  useEffect(() => {
    const handler = () => {
      const loc = useAppStore.getState().userLocation;
      if (!loc) return;
      useAppStore.getState().setHighlightedUserId(null);
      PeekPokeBridge.setMapCamera({
        lat: loc.lat,
        lng: loc.lng,
        zoom: 17,
        pitch: 50,
        bearing: 0,
        animated: true,
        durationMs: 1200,
      });
    };
    window.addEventListener("recenter-map", handler);
    return () => window.removeEventListener("recenter-map", handler);
  }, []);

  // Listen to native camera changes — update visible users + trigger pin recompute
  useEffect(() => {
    let handle: PluginListenerHandle | null = null;
    let cleaned = false;
    PeekPokeBridge.addListener("mapCameraChanged", (e) => {
      const bounds: [number, number, number, number] =
        e.bounds ?? boundsFromCamera(e.lat, e.lng, e.zoom);
      setCamera({ lat: e.lat, lng: e.lng, zoom: e.zoom, bearing: e.bearing, pitch: e.pitch, bounds });
      // Update visible users for the swiper
      const all = useAppStore.getState().nearbyUsers;
      setVisibleUsers(
        all.filter(
          (u) => u.lng >= bounds[0] && u.lat >= bounds[1] && u.lng <= bounds[2] && u.lat <= bounds[3]
        )
      );
    }).then((h) => {
      if (cleaned) h.remove();
      else handle = h;
    });
    return () => {
      cleaned = true;
      handle?.remove();
    };
  }, [setVisibleUsers]);

  // Listen to native pin taps
  useEffect(() => {
    let handle: PluginListenerHandle | null = null;
    let cleaned = false;
    PeekPokeBridge.addListener("mapPinTapped", (e) => {
      if (e.kind === "cluster") {
        setSelectedClusterPinId(e.id);
        setSelectedClusterUserIds(e.childIds ?? null);
      } else if (e.kind === "bot") {
        // Web parity: BotPin collects when in range, hints otherwise
        const { userLocation, bots } = useAppStore.getState();
        const bot = bots.find((b) => b.id === e.id);
        if (!bot || !userLocation) return;
        if (haversineKm(userLocation.lat, userLocation.lng, bot.lat, bot.lng) <= BOT_COLLECT_RANGE_KM) {
          collectBot(e.id);
        } else {
          window.dispatchEvent(new CustomEvent("peekpoke:bot-hint"));
        }
      } else if (!e.id.startsWith("self_")) {
        setSelectedClusterPinId(null);
        setSelectedClusterUserIds(null);
        selectUser(e.id);
      }
    }).then((h) => {
      if (cleaned) h.remove();
      else handle = h;
    });
    return () => {
      cleaned = true;
      handle?.remove();
    };
  }, [selectUser, setSelectedClusterUserIds]);

  // Empty-map taps clear selections (web MapView onClick parity)
  useEffect(() => {
    let handle: PluginListenerHandle | null = null;
    let cleaned = false;
    PeekPokeBridge.addListener("mapTapped", () => {
      setSelectedClusterPinId(null);
      const store = useAppStore.getState();
      store.setSelectedClusterUserIds(null);
      store.setHighlightedUserId(null);
    }).then((h) => {
      if (cleaned) h.remove();
      else handle = h;
    });
    return () => {
      cleaned = true;
      handle?.remove();
    };
  }, []);

  // Build Supercluster whenever user data changes (not on every camera move)
  const supercluster = useMemo(() => {
    const sc = new Supercluster<{ userId: string }>({ radius: 40, maxZoom: 20 });
    const highlightedPos = highlightedUserId
      ? nearbyUsers.find((u) => u.userId === highlightedUserId)
      : null;
    const points = nearbyUsers
      .filter((u) => {
        if (u.userId === highlightedUserId) return false;
        if (
          highlightedPos &&
          haversineKm(u.lat, u.lng, highlightedPos.lat, highlightedPos.lng) < 0.03
        )
          return false;
        return true;
      })
      .map((u) => ({
        type: "Feature" as const,
        properties: { userId: u.userId },
        geometry: { type: "Point" as const, coordinates: [u.lng, u.lat] },
      }));
    sc.load(points);
    return sc;
  }, [nearbyUsers, highlightedUserId]);

  // Compute + push pins whenever any data dependency changes, debounced via RAF
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pins: MapPin[] = [];

      // Self pin
      if (userLocation && profile) {
        const name = profile.display_name || profile.username || "?";
        pins.push({
          id: `self_${profile.id}`,
          lat: userLocation.lat,
          lng: userLocation.lng,
          kind: "self",
          avatarUrl: profile.avatar_url,
          initial: name[0]?.toUpperCase() ?? "?",
          colorIndex: pinColorIndex(name),
          isOnline: true,
        });
      }

      // Highlighted user pin (rendered separately from cluster set).
      // Use raw userId as the pin ID so mapPinTapped → selectUser works without prefix-stripping.
      const highlightedUser = highlightedUserId
        ? nearbyUsers.find((u) => u.userId === highlightedUserId)
        : null;
      if (highlightedUser) {
        const name = highlightedUser.display_name || highlightedUser.username || "?";
        pins.push({
          id: highlightedUser.userId,
          lat: highlightedUser.lat,
          lng: highlightedUser.lng,
          kind: "highlighted",
          avatarUrl: highlightedUser.avatar_url,
          initial: name[0]?.toUpperCase() ?? "?",
          colorIndex: pinColorIndex(name),
          isOnline: onlineUsers.has(highlightedUser.userId),
        });
      }

      // Clusters / individual users
      const currentCamera = camera;
      const bounds = currentCamera
        ? currentCamera.bounds
        : userLocation
        ? boundsFromCamera(userLocation.lat, userLocation.lng, 17)
        : null;

      if (bounds) {
        const zoom = currentCamera?.zoom ?? 17;
        const clusters = supercluster.getClusters(bounds, Math.round(zoom));
        for (const cluster of clusters) {
          const [lng, lat] = cluster.geometry.coordinates;
          if ("cluster" in cluster.properties && cluster.properties.cluster) {
            const { cluster_id, point_count } = cluster.properties as Supercluster.ClusterProperties;
            const leaves = supercluster.getLeaves(cluster_id, Infinity);
            pins.push({
              id: `cluster_${cluster_id}`,
              lat,
              lng,
              kind: "cluster",
              avatarUrl: null,
              initial: point_count > 99 ? "99+" : String(point_count),
              colorIndex: 0,
              isSelected: selectedClusterPinId === `cluster_${cluster_id}`,
              count: point_count,
              childIds: leaves.map((l) => l.properties.userId),
            });
          } else {
            const userId = (cluster.properties as { userId: string }).userId;
            const user = nearbyUsers.find((u) => u.userId === userId);
            if (!user) continue;
            const name = user.display_name || user.username || "?";
            pins.push({
              id: userId,
              lat: user.lat,
              lng: user.lng,
              kind: friendIds.has(userId) ? "friend" : "user",
              avatarUrl: user.avatar_url,
              initial: name[0]?.toUpperCase() ?? "?",
              colorIndex: pinColorIndex(name),
              isOnline: onlineUsers.has(userId),
              isPending: pendingUserId === userId,
            });
          }
        }
      }

      // Bot pins — collectable within range, mirroring web BotPin
      for (const b of bots) {
        pins.push({
          id: b.id,
          lat: b.lat,
          lng: b.lng,
          kind: "bot",
          avatarUrl: null,
          initial: "C",
          colorIndex: 5,
          collectable:
            !!userLocation &&
            haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) <= BOT_COLLECT_RANGE_KM,
        });
      }

      PeekPokeBridge.setMapPins({ pins });
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [supercluster, camera, userLocation, profile, friendIds, pendingUserId, bots, onlineUsers, highlightedUserId, nearbyUsers, selectedClusterPinId]);

  return null;
}
