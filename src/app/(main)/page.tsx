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

    const publish = () => {
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

    publish();

    const ro = new ResizeObserver(publish);

    // Observe all current .pointer-events-auto nodes
    document.querySelectorAll<HTMLElement>(".pointer-events-auto").forEach((el) => ro.observe(el));

    const mo = new MutationObserver((mutations) => {
      // Also observe any newly-added .pointer-events-auto nodes so that subsequent
      // size changes (e.g. swiper cards loading after data arrives) retrigger publish.
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("pointer-events-auto")) ro.observe(node);
          node.querySelectorAll<HTMLElement>(".pointer-events-auto").forEach((el) => ro.observe(el));
        }
        // Unobserve removed nodes to prevent memory leaks
        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof HTMLElement) ro.unobserve(node);
        }
      }
      publish();
    });

    mo.observe(document.body, { childList: true, subtree: true, attributes: false });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
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
