"use client";

import { MapView } from "@/components/map/MapViewDynamic";
import { NearbySwiper } from "@/components/map/NearbySwiper";
import { RecenterButton } from "@/components/map/RecenterButton";
import { MapTopLabels } from "@/components/map/MapTopLabels";

export default function MainPage() {
  return (
    <div className="relative h-full">
      <MapTopLabels />
      <MapView />
      <NearbySwiper />
      <RecenterButton />
    </div>
  );
}
