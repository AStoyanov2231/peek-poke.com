"use client";

import { LocateFixed } from "lucide-react";
import { useUserLocation } from "@/stores/selectors";

export function RecenterButton() {
  const userLocation = useUserLocation();

  return (
    <div className="md:hidden absolute bottom-28 right-4 z-40">
      <button
        onClick={() => window.dispatchEvent(new Event("recenter-map"))}
        disabled={!userLocation}
        className={`h-11 w-11 rounded-full bg-primary shadow-neu-raised-sm flex items-center justify-center active:scale-95 transition-transform ${
          !userLocation ? "opacity-50" : ""
        }`}
        aria-label="Center map on my location"
      >
        <LocateFixed className="h-7 w-7 text-white" />
      </button>
    </div>
  );
}
