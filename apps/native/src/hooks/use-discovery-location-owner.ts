import { useEffect, useState } from "react";
import { useDiscoveryActivity } from "@/data/discovery/lifecycle";
import {
  createLocationSyncCoordinator,
  locationIsFreshForDiscovery,
  runLocationSyncAttempt,
} from "@/data/discovery/location-sync";
import { updateLocation } from "@/data/discovery/api";
import {
  markDeviceLocationStale,
  markDeviceLocationSynced,
  refreshDeviceLocation,
  useDeviceLocation,
} from "@/lib/location";

export function useDiscoveryLocationOwner(userId: string | undefined) {
  const activity = useDiscoveryActivity();
  const deviceLocation = useDeviceLocation();
  const locationFresh = locationIsFreshForDiscovery(deviceLocation, userId);
  const active = activity.appState === "active" && Boolean(userId);
  const ownsLocation = active && !activity.focused;
  const [coordinator] = useState(createLocationSyncCoordinator);

  useEffect(() => {
    if (!ownsLocation || !userId || locationFresh) return;
    let current = true;
    void runLocationSyncAttempt({
      coordinator,
      userId,
      resolveCoordinates: refreshDeviceLocation,
      sync: updateLocation,
      onFailure: (error) => {
        if (!current) return;
        markDeviceLocationStale(
          userId,
          error instanceof Error ? error.message : "Could not refresh your location",
        );
      },
      onPending: () => undefined,
      onSuccess: (coords) => {
        if (current) markDeviceLocationSynced(userId, coords);
      },
    });
    return () => {
      current = false;
      coordinator.cancel();
    };
  }, [coordinator, locationFresh, ownsLocation, userId]);

  useEffect(() => () => coordinator.cancel(), [coordinator]);
}
