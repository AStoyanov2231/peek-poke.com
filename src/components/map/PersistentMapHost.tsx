"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapView } from "./MapViewDynamic";
import { useAppStore } from "@/stores/appStore";

export function PersistentMapHost() {
  const pathname = usePathname();
  const isMap = pathname === "/";
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (isMap) setActivated(true);
  }, [isMap]);

  // Stop orbit animation when user leaves the map
  useEffect(() => {
    if (!isMap) {
      useAppStore.getState().setHighlightedUserId(null);
    }
  }, [isMap]);

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
