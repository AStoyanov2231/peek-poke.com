"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapView } from "./MapViewDynamic";
import { NativeMapBridge } from "./NativeMapBridge";
import { useAppStore } from "@/stores/appStore";
import { isNativeApp } from "@/lib/native";

export function PersistentMapHost() {
  const pathname = usePathname();
  const [native, setNative] = useState(false);
  const isMap = pathname === "/";
  const [activated, setActivated] = useState(false);

  useEffect(() => { setNative(isNativeApp()); }, []);

  useEffect(() => {
    if (isMap) setActivated(true);
  }, [isMap]);

  // Clear highlighted user when leaving the map on web
  useEffect(() => {
    if (!native && !isMap) {
      useAppStore.getState().setHighlightedUserId(null);
    }
  }, [isMap, native]);

  // On native: mount NativeMapBridge (invisible) to drive the Swift Mapbox map
  if (native) {
    return activated ? <NativeMapBridge /> : null;
  }

  if (!activated) return null;

  return (
    <div
      className="fixed top-0 bottom-0 right-0 left-0 md:left-[580px] z-0"
      style={!isMap ? { visibility: "hidden", pointerEvents: "none" } : undefined}
    >
      <MapView />
    </div>
  );
}
