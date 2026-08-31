"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationFreshness, useUserLocation } from "@/stores/selectors";
import { bootstrapQueryOptions, botsQueryOptions } from "@/data/web-query";

export function useBots() {
  const location = useUserLocation();
  const viewerId = useQuery(bootstrapQueryOptions).data?.identity.id;
  const locationFresh = useLocationFreshness(viewerId);
  const data = useQuery({
    ...botsQueryOptions(location, viewerId),
    enabled: locationFresh,
  }).data;
  return locationFresh ? (data ?? []) : [];
}
