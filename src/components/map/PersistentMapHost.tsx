"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapView } from "./MapViewDynamic";
import { useAppStore } from "@/stores/appStore";
import { isNativeApp } from "@/lib/native";

export function PersistentMapHost() {
  const pathname = usePathname();
  const [native, setNative] = useState(false);
  const isMap = pathname === "/";
  const [activated, setActivated] = useState(false);

  useEffect(() => { setNative(isNativeApp()); }, []);

  useEffect(() => {
    if (native) return;
    if (isMap) setActivated(true);
  }, [isMap, native]);

  // Stop orbit animation when user leaves the map
  useEffect(() => {
    if (native || !isMap) {
      useAppStore.getState().setHighlightedUserId(null);
    }
  }, [isMap, native]);

  if (native || !activated) return null;

  return (
    <div
      className="fixed top-0 bottom-0 right-0 left-0 md:left-[580px] z-0"
      style={!isMap ? { visibility: "hidden", pointerEvents: "none" } : undefined}
    >
      <MapView />
    </div>
  );
}
