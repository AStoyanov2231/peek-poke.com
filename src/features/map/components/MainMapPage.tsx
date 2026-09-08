"use client";

import { useEffect, useState } from "react";

import { NearbySwiper } from "@/features/map/components/NearbySwiper";
import { RecenterButton } from "@/features/map/components/RecenterButton";
import { MapTopLabels } from "@/features/map/components/MapTopLabels";
import { MapSearchBar } from "@/features/map/components/MapSearchBar";
import { DesktopNearbyRail } from "@/features/map/components/DesktopNearbyRail";
import { BotHint } from "@/features/map/components/BotHint";
import { LocationGate } from "@/features/map/components/LocationGate";
import { LocationRecoveryAlert } from "@/features/map/components/LocationRecoveryAlert";
import { useQuery } from "@tanstack/react-query";
import { bootstrapQueryOptions } from "@/data/web-query";
import { useGeolocation } from "@/features/map/useGeolocation";
import { useMeetingDetection } from "@/features/map/useMeetingDetection";
import { useNearbyPresence } from "@/features/map/useNearbyPresence";
import { QrScanButton } from "@/features/map/components/QrScanButton";

export default function MainPage() {
  const userId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const [locationEnabled, setLocationEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    if (navigator.permissions) void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (active && permission.state === "granted") setLocationEnabled(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useGeolocation(locationEnabled ? userId : undefined);
  const locationPresence = useNearbyPresence(userId);
  useMeetingDetection(userId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* 340px nearby rail — desktop only (hidden on mobile) */}
      <DesktopNearbyRail />

      {/* Map canvas */}
      <div className="flex-1 relative min-w-0 pointer-events-none">
        <MapSearchBar />
        <MapTopLabels />
        <QrScanButton />
        <NearbySwiper />
        <RecenterButton />
        <BotHint />
        <LocationGate
          pending={locationPresence.isLocationSyncPending}
          requested={locationEnabled}
          onRetry={() => { if (!locationEnabled) setLocationEnabled(true); else locationPresence.retryLocationSync(); }}
        />
        <LocationRecoveryAlert
          open={locationPresence.isLocationSyncError}
          pending={locationPresence.isLocationSyncPending}
          onRetry={locationPresence.retryLocationSync}
        />
      </div>
    </div>
  );
}
