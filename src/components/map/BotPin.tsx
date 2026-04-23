"use client";

import { useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { Coins } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { Bot } from "@/stores/appStore";

interface BotPinProps {
  bot: Bot;
  collectable: boolean;
}

export function BotPin({ bot, collectable }: BotPinProps) {
  const [collecting, setCollecting] = useState(false);
  const [hint, setHint] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!collectable) {
      setHint(true);
      setTimeout(() => setHint(false), 2000);
      return;
    }
    if (collecting) return;
    const loc = useAppStore.getState().userLocation;
    if (!loc) return;
    setCollecting(true);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bot.id, lat: loc.lat, lng: loc.lng }),
      });
      const data = await res.json();
      if (data.ok) {
        useAppStore.getState().removeBot(bot.id);
        useAppStore.getState().setCoins(data.balance);
        // Refill pool
        fetch(`/api/bots?lat=${loc.lat}&lng=${loc.lng}`)
          .then((r) => r.json())
          .then((bots) => { if (Array.isArray(bots)) useAppStore.getState().setBots(bots); });
      }
    } catch (err) {
      console.error("Bot collect failed:", err);
    } finally {
      setCollecting(false);
    }
  };

  return (
    <Marker longitude={bot.lng} latitude={bot.lat} anchor="center" style={{ zIndex: 5 }}>
      <div style={{ position: "relative", cursor: "pointer" }} onClick={handleClick}>
        <div
          className={collectable ? "presence-pulse" : ""}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: collectable ? "var(--warn-500)" : "var(--ink-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid white",
            boxShadow: "var(--e-2)",
            opacity: collecting ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}
        >
          <Coins size={18} strokeWidth={2} color={collectable ? "white" : "var(--ink-6)"} />
        </div>
        {hint && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--ink-9)",
              color: "white",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            Get closer
          </div>
        )}
      </div>
    </Marker>
  );
}
