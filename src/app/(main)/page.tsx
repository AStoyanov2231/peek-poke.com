"use client";

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
