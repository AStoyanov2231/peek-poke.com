"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { discardUnsafeWebLocationCaches } from "@/features/map/location-sync";
import { useAppStore } from "@/stores/appStore";

export function WebLocationFreshnessLifecycle() {
  const queryClient = useQueryClient();
  const locationFreshForUserId = useAppStore((state) => state.locationFreshForUserId);
  const expireLocationIfNeeded = useAppStore((state) => state.expireLocationIfNeeded);

  useEffect(() => {
    const check = () => { expireLocationIfNeeded(); };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [expireLocationIfNeeded]);

  useEffect(() => {
    if (locationFreshForUserId) return;
    let current = true;
    void discardUnsafeWebLocationCaches(queryClient, () => current);
    return () => { current = false; };
  }, [locationFreshForUserId, queryClient]);

  return null;
}
