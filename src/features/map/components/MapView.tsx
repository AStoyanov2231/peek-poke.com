"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import Supercluster from "supercluster";
import "mapbox-gl/dist/mapbox-gl.css";
import { useUserLocation, useNearbyUsers, useProfile, useFriends, useHighlightedUserId, usePendingUserId, useHighlightedData } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { UserPinContent } from "./UserPin";
import { HighlightedPin } from "./HighlightedPin";
import { BotPin } from "./BotPin";
import { useBots as useBotsHook } from "@/features/map/useBots";
import { haversineKm } from "@/lib/geo";
import type { NearbyUser } from "@/types/database";
import type { MapRef } from "react-map-gl/mapbox";
import { useAvailablePeople } from "@/features/map/useAvailablePeople";
import { activityInfo } from "@/features/now/activities";

const DEFAULT_ZOOM = 13;
const DEFAULT_PITCH = 0;
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
  const availablePeople = useAvailablePeople();
  const bots = useBotsHook();
  const setSelectedClusterUserIds = useAppStore((s) => s.setSelectedClusterUserIds);
  const setHighlightedUserId = useAppStore((s) => s.setHighlightedUserId);
  const selectUser = useAppStore((s) => s.selectUser);

  const hasCentered = useRef(false);
  const isDragging = useRef(false);
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
      if (userLocation) {
        mapRef.current?.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: DEFAULT_ZOOM,
          pitch: DEFAULT_PITCH,
          bearing: 0,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
        });
      }
    };
    window.addEventListener("recenter-map", handler);
    return () => window.removeEventListener("recenter-map", handler);
  }, [userLocation]);

  // Nearby pins represent an area. Keep neighborhood context and let the
  // person control the camera instead of orbiting an approximate coordinate.
  useEffect(() => {
    if (!highlightedUserId || !mapRef.current) return;
    const user = nearbyUsers.find((item) => item.userId === highlightedUserId);
    if (!user) return;
    const isMobile = window.innerWidth < 768;
    mapRef.current.easeTo({
      center: [user.lng, user.lat],
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      pitch: DEFAULT_PITCH,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
      padding: isMobile
        ? { left: 0, right: 0, top: 0, bottom: 240 }
        : { left: 0, right: 160, top: 0, bottom: 0 },
    });
  }, [highlightedUserId, nearbyUsers]);

  // Supercluster for marker clustering
  const supercluster = useMemo(() => {
    const sc = new Supercluster<UserPointProperties>({ radius: 40, maxZoom: 20 });
    const highlightedPos = highlightedUserId ? nearbyUsers.find(u => u.userId === highlightedUserId) : null;
    const points: Supercluster.PointFeature<UserPointProperties>[] = [];
    for (const user of nearbyUsers) {
      if (user.userId === highlightedUserId) continue;
      if (highlightedPos && haversineKm(user.lat, user.lng, highlightedPos.lat, highlightedPos.lng) < 0.03) continue;
      points.push({
        type: "Feature",
        properties: { userId: user.userId },
        geometry: { type: "Point", coordinates: [user.lng, user.lat] },
      });
    }
    sc.load(points);
    return sc;
  }, [nearbyUsers, highlightedUserId]);

  // Compute clusters when zoom changes or a pan ends.
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
    useAppStore.getState().setVisibleUsers(
      nearbyUsers.filter(u => b.contains([u.lng, u.lat]))
    );
  }, [nearbyUsers]);

  const handleDragStart = useCallback(() => { isDragging.current = true; }, []);
  const handleDragEnd = useCallback(() => { setTimeout(() => { isDragging.current = false; }, 100); }, []);

  // Clear map selections unless the click followed a drag.
  const handleMapClick = useCallback(() => {
    if (isDragging.current) return;
    setSelectedClusterId(null);
    setSelectedClusterUserIds(null);
    setHighlightedUserId(null);
  }, [setSelectedClusterUserIds, setHighlightedUserId]);

  // Delegate user selection and profile loading to the store.
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
    ? {
        userId: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        is_online: profile.is_online,
        last_seen_at: profile.last_seen_at,
        lat: userLocation.lat,
        lng: userLocation.lng,
      }
    : null;

  return (
    <div className="absolute inset-0 z-0 isolation-isolate">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
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
        minZoom={8}
        maxPitch={60}
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
                <button type="button"
                  className={`user-pin-cluster ${isSelected ? "user-pin-cluster-selected" : ""}`}
                  onClick={(e) => { e.stopPropagation(); handleClusterClick(cluster_id); }}
                  tabIndex={0}
                  aria-label={`View ${point_count} nearby users`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); handleClusterClick(cluster_id); } }}
                >
                  <span>{display}</span>
                </button>
              </Marker>
            );
          }

          const userId = (cluster.properties as UserPointProperties).userId;
          const user = nearbyUsers.find(u => u.userId === userId);
          if (!user) return null;

          return (
            <Marker key={userId} longitude={lng} latitude={lat} anchor="center">
              <button type="button"
                className={pendingUserId === userId ? "user-pin-loading" : ""}
                onClick={(e) => { e.stopPropagation(); handleUserClick(userId); }}
                tabIndex={0}
                aria-label={`View ${user.display_name || user.username || "user"}${availablePeople.has(userId) ? `, up for ${availablePeople.get(userId)?.customLabel ?? activityInfo(availablePeople.get(userId)!.activity).label.toLowerCase()}` : ""}`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); handleUserClick(userId); } }}
              >
                <UserPinContent user={user} isFriend={friendIds.has(userId)} availability={availablePeople.get(userId)} />
              </button>
            </Marker>
          );
        })}

        {/* Coin bot pins */}
        {bots.map((b) => (
          <BotPin
            key={b.id}
            bot={b}
            viewerId={profile?.id ?? ""}
            location={userLocation}
            collectable={Boolean(profile && userLocation) && haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) <= 0.05}
          />
        ))}

        {/* Highlighted user pin */}
        {highlightedUser && highlightedData && (
          <HighlightedPin
            key={highlightedUser.userId}
            user={highlightedUser}
            isFriend={friendIds.has(highlightedUser.userId)}
            availability={availablePeople.get(highlightedUser.userId)}
            initialData={highlightedData}
          />
        )}
      </Map>
    </div>
  );
}
