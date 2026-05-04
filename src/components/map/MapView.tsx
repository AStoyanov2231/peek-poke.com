"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import Supercluster from "supercluster";
import "mapbox-gl/dist/mapbox-gl.css";
import { useUserLocation, useNearbyUsers, useProfile, useFriends, useHighlightedUserId, useIsPremium, usePendingUserId, useHighlightedData, useBots } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { UserPinContent } from "./UserPin";
import { HighlightedPin } from "./HighlightedPin";
import { BotPin } from "./BotPin";
import { useBots as useBotsHook } from "@/hooks/useBots";
import { haversineKm } from "@/lib/geo";
import type { NearbyUser } from "@/types/database";
import type { MapRef } from "react-map-gl/mapbox";

const DEFAULT_ZOOM = 17;
const DEFAULT_PITCH = 50;
const MAP_STYLE = "mapbox://styles/mapbox/standard";
// const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
// const MAP_STYLE = "mapbox://styles/mapbox/outdoors-v12";
// const MAP_STYLE = "mapbox://styles/mapbox/light-v11";
// const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";
// const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

interface UserPointProperties {
  userId: string;
}

export function MapViewInner() {
  const mapRef = useRef<MapRef>(null);
  const userLocation = useUserLocation();
  const nearbyUsers = useNearbyUsers();
  const profile = useProfile();
  const friends = useFriends();
  const friendIds = useMemo(() => new Set(friends.map(f => f.id)), [friends]);
  const highlightedUserId = useHighlightedUserId();
  const pendingUserId = usePendingUserId();
  const highlightedData = useHighlightedData();
  const isPremium = useIsPremium();
  const bots = useBots();
  const setSelectedClusterUserIds = useAppStore((s) => s.setSelectedClusterUserIds);
  const setHighlightedUserId = useAppStore((s) => s.setHighlightedUserId);
  const selectUser = useAppStore((s) => s.selectUser);
  useBotsHook();

  const hasCentered = useRef(false);
  const isDragging = useRef(false);
  const isOrbitingRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | null>(null);
  const [viewState, setViewState] = useState({
    longitude: userLocation?.lng ?? 0,
    latitude: userLocation?.lat ?? 0,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: 0,
  });

  // Center once on first location
  useEffect(() => {
    if (userLocation && !hasCentered.current) {
      hasCentered.current = true;
      setViewState(prev => ({
        ...prev,
        longitude: userLocation.lng,
        latitude: userLocation.lat,
      }));
    }
  }, [userLocation]);

  // Listen for manual recenter requests
  useEffect(() => {
    const handler = () => {
      useAppStore.getState().setHighlightedUserId(null);
      const loc = useAppStore.getState().userLocation;
      if (loc) {
        mapRef.current?.flyTo({
          center: [loc.lng, loc.lat],
          zoom: DEFAULT_ZOOM,
          pitch: DEFAULT_PITCH,
          bearing: 0,
          duration: 1200,
        });
      }
    };
    window.addEventListener("recenter-map", handler);
    return () => window.removeEventListener("recenter-map", handler);
  }, []);

  // Center on highlighted user then orbit — orbit delayed until easeTo finishes
  useEffect(() => {
    if (!highlightedUserId || !mapRef.current) return;
    const user = useAppStore.getState().nearbyUsers.find((u) => u.userId === highlightedUserId);
    if (!user) return;
    const map = mapRef.current.getMap();
    const targetZoom = Math.max(map.getZoom(), 17);
    const isMobile = window.innerWidth < 768;
    const EASE_MS = 700;
    mapRef.current.easeTo({
      center: [user.lng, user.lat],
      zoom: targetZoom,
      duration: EASE_MS,
      padding: isMobile
        ? { left: 0, right: 0, top: 0, bottom: 300 }
        : { left: 0, right: 0, top: 0, bottom: 0 },
    });
    let rafId: number;
    const tid = setTimeout(() => {
      const startBearing = map.getBearing();
      const start = performance.now();
      isOrbitingRef.current = true;
      const animate = (now: number) => {
        setViewState(prev => ({ ...prev, bearing: startBearing + (now - start) * (360 / 60000) }));
        rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);
    }, EASE_MS);
    return () => { isOrbitingRef.current = false; clearTimeout(tid); cancelAnimationFrame(rafId); };
  }, [highlightedUserId]);

  // Supercluster for marker clustering
  const supercluster = useMemo(() => {
    const sc = new Supercluster<UserPointProperties>({ radius: 40, maxZoom: 20 });
    const highlightedPos = highlightedUserId ? nearbyUsers.find(u => u.userId === highlightedUserId) : null;
    const points: Supercluster.PointFeature<UserPointProperties>[] = nearbyUsers
      .filter(u => {
        if (u.userId === highlightedUserId) return false;
        if (highlightedPos && haversineKm(u.lat, u.lng, highlightedPos.lat, highlightedPos.lng) < 0.03) return false;
        return true;
      })
      .map(u => ({
        type: "Feature",
        properties: { userId: u.userId },
        geometry: { type: "Point", coordinates: [u.lng, u.lat] },
      }));
    sc.load(points);
    return sc;
  }, [nearbyUsers, highlightedUserId]);

  // Compute clusters from current viewport — only recomputes when zoom changes or pan ends
  const clusters = useMemo(() => {
    if (!mapLoaded || !mapBounds) return [];
    return supercluster.getClusters(mapBounds, Math.round(viewState.zoom));
  }, [supercluster, viewState.zoom, mapBounds, mapLoaded]);

  // Recompute visible users on move end
  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    if (!b) return;
    setMapBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    const all = useAppStore.getState().nearbyUsers;
    useAppStore.getState().setVisibleUsers(
      all.filter(u => b.contains([u.lng, u.lat]))
    );
  }, []);

  const handleDragStart = useCallback(() => { isDragging.current = true; }, []);
  const handleDragEnd = useCallback(() => { setTimeout(() => { isDragging.current = false; }, 100); }, []);

  // Handle map click (clear selections) — skip if drag just ended
  const handleMapClick = useCallback(() => {
    if (isDragging.current) return;
    setSelectedClusterId(null);
    setSelectedClusterUserIds(null);
    setHighlightedUserId(null);
  }, [setSelectedClusterUserIds, setHighlightedUserId]);

  // Handle user click — delegates fetch + open to store action
  const handleUserClick = useCallback((userId: string) => {
    setSelectedClusterId(null);
    setSelectedClusterUserIds(null);
    selectUser(userId);
  }, [setSelectedClusterUserIds, selectUser]);

  // Handle cluster click
  const handleClusterClick = useCallback((clusterId: number) => {
    setSelectedClusterId(clusterId);
    const leaves = supercluster.getLeaves(clusterId, Infinity);
    setSelectedClusterUserIds(leaves.map(l => l.properties.userId));
  }, [supercluster, setSelectedClusterUserIds]);

  const highlightedUser = highlightedUserId
    ? nearbyUsers.find((u) => u.userId === highlightedUserId)
    : null;

  if (!userLocation) return null;

  const selfPin: NearbyUser | null = userLocation && profile
    ? { userId: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, lat: userLocation.lat, lng: userLocation.lng }
    : null;

  return (
    <div className="absolute inset-0 z-0 isolation-isolate">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => { if (!isOrbitingRef.current) setViewState(evt.viewState); }}
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleMapClick}
        onError={(e) => { console.error("[MapView] mapbox error", e.error); }}
        onLoad={() => {
          useAppStore.getState().setMapReady(true);
          setMapLoaded(true);
          const map = mapRef.current?.getMap();
          if (map) {
            const b = map.getBounds();
            if (b) setMapBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
            const h = new Date().getHours();
            const preset = h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 19 ? "day" : h >= 19 && h < 21 ? "dusk" : "night";
            map.setConfigProperty("basemap", "lightPreset", preset);
          }
        }}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        minZoom={16}
        maxPitch={85}
        clickTolerance={8}
        fadeDuration={0}
      >
        {/* Self pin */}
        {selfPin && (
          <Marker longitude={selfPin.lng} latitude={selfPin.lat} anchor="center">
            <UserPinContent user={selfPin} isSelf />
          </Marker>
        )}

        {/* Clustered and individual pins */}
        {clusters.map(cluster => {
          const [lng, lat] = cluster.geometry.coordinates;

          if ("cluster" in cluster.properties && cluster.properties.cluster) {
            const { point_count, cluster_id } = cluster.properties as Supercluster.ClusterProperties;
            const display = point_count > 99 ? "99+" : String(point_count);
            const isSelected = cluster_id === selectedClusterId;
            return (
              <Marker
                key={`cluster-${cluster_id}`}
                longitude={lng}
                latitude={lat}
                anchor="center"
              >
                <div
                  className={`user-pin-cluster ${isSelected ? "user-pin-cluster-selected" : ""}`}
                  onClick={(e) => { e.stopPropagation(); handleClusterClick(cluster_id); }}
                >
                  <span>{display}</span>
                </div>
              </Marker>
            );
          }

          const userId = (cluster.properties as UserPointProperties).userId;
          const user = nearbyUsers.find(u => u.userId === userId);
          if (!user) return null;

          return (
            <Marker key={userId} longitude={lng} latitude={lat} anchor="center">
              <div
                className={pendingUserId === userId ? "user-pin-loading" : ""}
                onClick={(e) => { e.stopPropagation(); handleUserClick(userId); }}
              >
                <UserPinContent user={user} isFriend={friendIds.has(userId)} />
              </div>
            </Marker>
          );
        })}

        {/* Coin bot pins */}
        {bots.map((b) => (
          <BotPin
            key={b.id}
            bot={b}
            collectable={!!userLocation && haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) <= 0.05}
          />
        ))}

        {/* Highlighted user pin */}
        {highlightedUser && highlightedData && (
          <HighlightedPin
            key={highlightedUser.userId}
            user={highlightedUser}
            isFriend={friendIds.has(highlightedUser.userId)}
            isPremium={isPremium}
            initialData={highlightedData}
          />
        )}
      </Map>
    </div>
  );
}
