"use client";

import { useEffect } from "react";
import { NearbySwiper } from "@/components/map/NearbySwiper";
import { RecenterButton } from "@/components/map/RecenterButton";
import { MapTopLabels } from "@/components/map/MapTopLabels";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { DesktopNearbyRail } from "@/components/map/DesktopNearbyRail";
import { DevSeedButton } from "@/components/map/DevSeedButton";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";

// Native overlays the WebView on the Mapbox map. Publish bounding rects of
// every floating UI element so native can let map touches pass through the
// transparent gaps. `.pointer-events-auto` is the project's marker for
// floating cards/buttons on the map page.
function useNativeMapPassthrough() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let last = "";
    const tick = () => {
      const els = document.querySelectorAll<HTMLElement>(".pointer-events-auto");
      const rects = Array.from(els).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      const sig = JSON.stringify(rects);
      if (sig !== last) {
        last = sig;
        PeekPokeBridge.setMapInteractiveRects({ rects });
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => { window.clearInterval(id); };
  }, []);
}

export default function MainPage() {
  useNativeMapPassthrough();
  return (
    <div className="flex h-full overflow-hidden">
      {/* 340px nearby rail — desktop only (hidden on mobile) */}
      <DesktopNearbyRail />

      {/* Map canvas */}
      <div className="flex-1 relative min-w-0 pointer-events-none">
        <MapSearchBar />
        <MapTopLabels />
        <NearbySwiper />
        <RecenterButton />
        {process.env.NODE_ENV !== "production" && <DevSeedButton />}
      </div>
    </div>
  );
}
