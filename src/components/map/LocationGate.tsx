"use client";

import { Loader2, MapPinOff } from "lucide-react";
import { useLocationStatus, useUserLocation } from "@/stores/selectors";
import { isNativeApp } from "@/lib/native";
import { PeekPokeBridge } from "@/lib/peekpoke-bridge";

/**
 * Covers the map area until the first location fix. Web renders no map without
 * a fix; on native the Mapbox map sits at a fallback city, so without this gate
 * users see a wrong place with no explanation. Denied permission gets a
 * Settings deep link on native and instructions on web.
 */
export function LocationGate() {
  const userLocation = useUserLocation();
  const status = useLocationStatus();

  if (userLocation) return null;

  return (
    <div
      // Inline background: html.native-map strips the .bg-background class to
      // transparent, but this overlay must hide the native map underneath.
      // Fixed so it also covers the status-bar strip above the page container.
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 px-8 text-center pointer-events-auto"
      style={{ background: "var(--bg)" }}
    >
      {status === "denied" ? (
        <>
          <MapPinOff className="h-10 w-10 text-muted-foreground" />
          <p className="t-title-3 text-ink-9">Location is off</p>
          <p className="text-sm text-muted-foreground">
            Peek &amp; Poke needs your location to show people nearby.
          </p>
          {isNativeApp() ? (
            <button
              onClick={() => PeekPokeBridge.openExternal({ url: "app-settings:" })}
              className="mt-2 px-6 py-3 rounded-full bg-ink-9 text-white text-sm font-semibold shadow-e-1"
            >
              Open Settings
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Allow location access for this site in your browser settings, then reload.
            </p>
          )}
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Finding you…</p>
        </>
      )}
    </div>
  );
}
