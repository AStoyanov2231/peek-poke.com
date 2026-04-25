"use client";

import { MapView } from "@/components/map/MapViewDynamic";
import { NearbySwiper } from "@/components/map/NearbySwiper";
import { RecenterButton } from "@/components/map/RecenterButton";
import { MapTopLabels } from "@/components/map/MapTopLabels";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { DesktopNearbyRail } from "@/components/map/DesktopNearbyRail";
import { DevSeedButton } from "@/components/map/DevSeedButton";

export default function MainPage() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* 340px nearby rail — desktop only (hidden on mobile) */}
      <DesktopNearbyRail />

      {/* Map canvas */}
      <div className="flex-1 relative min-w-0">
        <MapSearchBar />
        <MapTopLabels />
        <MapView />
        <NearbySwiper />
        <RecenterButton />
        {process.env.NODE_ENV !== "production" && <DevSeedButton />}
      </div>
    </div>
  );
}
