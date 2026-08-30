"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Coins, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminCoin } from "@/types/database";
import { fetchAdminCoins } from "@/data/admin-query";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const DEFAULT_VIEWPORT = { longitude: 23.3219, latitude: 42.6977, zoom: 12 };

export function AdminCoinsTab() {
  const queryClient = useQueryClient();
  const [placing, setPlacing] = useState(false);

  const { data: coins = [], isLoading } = useQuery({
    queryKey: ["admin-coins"],
    queryFn: ({ signal }) => fetchAdminCoins(signal),
  });

  const placeMutation = useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const res = await fetch("/api/admin/coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      if (!res.ok) throw new Error("Failed to place coin");
      return res.json() as Promise<AdminCoin>;
    },
    onSuccess: (coin) => {
      queryClient.setQueryData<AdminCoin[]>(["admin-coins"], (prev = []) => [coin, ...prev]);
      setPlacing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (coinId: string) => {
      const res = await fetch(`/api/admin/coins/${coinId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete coin");
    },
    onSuccess: (_data, coinId) => {
      queryClient.setQueryData<AdminCoin[]>(["admin-coins"], (prev = []) =>
        prev.filter((c) => c.id !== coinId)
      );
    },
  });

  const handleMapClick = useCallback(
    (e: { lngLat: { lat: number; lng: number } }) => {
      if (!placing || placeMutation.isPending) return;
      placeMutation.mutate({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    },
    [placing, placeMutation]
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[600px]">
      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-border relative min-h-[300px]">
        <Map
          initialViewState={DEFAULT_VIEWPORT}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          onClick={handleMapClick}
          cursor={placing ? "crosshair" : "grab"}
          style={{ width: "100%", height: "100%" }}
        >
          {coins.map((coin) => (
            <Marker key={coin.id} longitude={coin.lng} latitude={coin.lat} anchor="center">
              <button type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!placing) deleteMutation.mutate(coin.id);
                }}
                className="w-8 h-8 rounded-full bg-yellow-400 border-2 border-yellow-600 shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
                title="Click to delete"
              >
                <Coins className="h-4 w-4 text-yellow-800" />
              </button>
            </Marker>
          ))}
        </Map>

        {/* Place mode overlay */}
        {placing && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full pointer-events-none">
            {placeMutation.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Placing…</span>
            ) : (
              "Click on the map to place a coin"
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-72 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Placed Coins</p>
            <p className="text-xs text-muted-foreground">{coins.length} on map</p>
          </div>
          <Button
            size="sm"
            variant={placing ? "secondary" : "default"}
            onClick={() => setPlacing((p) => !p)}
            disabled={placeMutation.isPending}
          >
            <Coins className="h-4 w-4 mr-1.5" />
            {placing ? "Cancel" : "Place Coin"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))
          ) : coins.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No coins placed yet</p>
            </div>
          ) : (
            coins.map((coin) => (
              <div key={coin.id} className="card-flat rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <Coins className="h-4 w-4 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-muted-foreground truncate">{coin.id.slice(0, 8)}…</p>
                  <p className="text-xs text-muted-foreground">
                    {coin.lat.toFixed(4)}, {coin.lng.toFixed(4)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                  onClick={() => deleteMutation.mutate(coin.id)}
                  disabled={deleteMutation.isPending && deleteMutation.variables === coin.id}
                >
                  {deleteMutation.isPending && deleteMutation.variables === coin.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
