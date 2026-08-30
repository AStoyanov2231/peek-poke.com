import { useEffect } from "react";
import { nativeQueryClient } from "@/data/query-client";
import { locationIsFreshForDiscovery } from "@/data/discovery/location-sync";
import {
  clearDeviceLocationFreshness,
  useDeviceLocation,
} from "@/lib/location";

export function useLocationFreshnessLifecycle(userId: string | undefined) {
  const deviceLocation = useDeviceLocation();
  const locationFresh = locationIsFreshForDiscovery(deviceLocation, userId);

  useEffect(() => {
    if (
      deviceLocation.freshForUserId &&
      deviceLocation.freshForUserId !== userId
    ) {
      clearDeviceLocationFreshness();
    }
  }, [deviceLocation.freshForUserId, userId]);

  useEffect(() => {
    if (locationFresh) return;
    let current = true;
    void Promise.all([
      nativeQueryClient.cancelQueries({ queryKey: ["discovery", "nearby"] }),
      nativeQueryClient.cancelQueries({ queryKey: ["discovery", "bots"] }),
    ]).then(() => {
      if (!current) return;
      nativeQueryClient.removeQueries({ queryKey: ["discovery", "nearby"] });
      nativeQueryClient.removeQueries({ queryKey: ["discovery", "bots"] });
    });
    return () => { current = false; };
  }, [locationFresh]);
}
