"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation2 } from "lucide-react";
import { useUserLocation, useVisibleUsers, useSelectedClusterUserIds, useNearbyUsers } from "@/stores/selectors";

export function RecenterButton() {
  const userLocation = useUserLocation();
  const visibleUsers = useVisibleUsers();
  const clusterIds = useSelectedClusterUserIds();
  const nearbyUsers = useNearbyUsers();

  const hasCards = clusterIds
    ? nearbyUsers.some((u) => clusterIds.includes(u.userId))
    : visibleUsers.length > 0;

  const [show, setShow] = useState(true);
  const prevCards = useRef(false);

  useEffect(() => {
    if (hasCards === prevCards.current) return;
    prevCards.current = hasCards;
    if (hasCards) {
      setShow(false);
      const t = setTimeout(() => setShow(true), 320);
      return () => clearTimeout(t);
    }
  }, [hasCards]);

  return (
    <>
      <style>{`@media(min-width:768px){.map-recenter{bottom:16px!important;transition:none!important}}`}</style>
      <button
        onClick={() => window.dispatchEvent(new Event("recenter-map"))}
        disabled={!userLocation}
        suppressHydrationWarning
        aria-label="Center map on my location"
        className="map-recenter iconbtn absolute right-4 z-40 active:scale-95 pointer-events-auto"
        style={{
          width: 44,
          height: 44,
          bottom: hasCards ? "calc(178px + env(safe-area-inset-bottom, 0px))" : "calc(94px + env(safe-area-inset-bottom, 0px))",
          opacity: show ? (userLocation ? 1 : 0.5) : 0,
          transform: show ? "translateX(0)" : "translateX(60px)",
          transition: show
            ? "opacity 250ms ease, transform 250ms ease, bottom 300ms ease"
            : "none",
        }}
      >
        <Navigation2 size={20} />
      </button>
    </>
  );
}
